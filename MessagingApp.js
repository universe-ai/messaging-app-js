const Hash = require("../core-js/util/hash");
const MessagingProtocolSpec = require("./MessagingProtocolSpec");
const Readline = require("readline");
const Agent = require("../core-js/protocol/Agent");
const Receipt = require("../core-js/datamodel/Receipt");
const {Node, NodeFactory} = require("../core-js/datamodel/Node");
const App = require("../core-js/protocol/App");
const AppUtil = require("../core-js/protocol/AppUtil");
const Logger = require("../core-js/logger/Logger");

/**
 * This messaging application supports closed-group direct peer-to-peer communication.
 * Each peer defined in the agentConfig is considered part of the group and will be targeted
 * with the receipts.
 *
 * maxIssue set to 1 for private conversations, >1 for friend-of-friend conversations.
 *
 */
class MessagingApp
{
    /**
     * @param {string} configFilePath path the .json file containing the app config
     * @param {object | null} userConfig optional overriding userConfig
     */
    constructor(configFilePath, userConfig)
    {
        this.profiles = {};

        this.instanceId = Hash.generateRandomHex(4);
        const loggerId = `${(this).constructor.name.slice(0, 12)}:${this.instanceId}`;
        this.logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

        /* The App instance is a convenient helper to handle the low level details of an app */
        this.app = new App(configFilePath, userConfig, MessagingProtocolSpec, this.logger);

        this.appConfig = this.app.getAppConfig();

        this.app.onStorageConnect( async () => {
            const includeDeleted = true;
            const depth = 1;

            const asyncRet = await this.app.getStorageClient().subscribe(this.appConfig.rootNodeId, depth,
                (asyncRet) => this._processData(asyncRet.getProps()), includeDeleted);

            if (!asyncRet.isSuccess()) {
                this.logger.error("Could not subscribe to storage.");
            }
            else {
                this.storageSubId = asyncRet.get();

                // Show last 30 lines of history.
                this._refresh(30, null, true);
            }
        });

        this.app.onStorageDisconnect( () => {
        });

        this.app.onProtocolConnect( async (protocol, storageFactory, name) => {
            console.error(`<Connected to peer: ${protocol.getPeerPubKey()} on connection "${name}">`);

            protocol.onClose( () => {
                console.error(`<Disconnected from peer: ${protocol.getPeerPubKey()}>`);
            });

            const syncer = protocol.initClientSync({name: "room"});
            syncer.onSync( (type) => {
                this.logger.info(`Downloaded data via: ${type}`);
            });
            const status = await syncer.start();
        });

        this.app.onError( (err) => {
            this.logger.info("Propagated error:", err);
        });

        /* Extract all target pub keys to which we issue receipts to.
         * This is a convenient way of knowing who we are talking to,
         * simply by getting who are we connecting to. */
        this.targetPubKeys = Agent.ExtractPeerKeys(this.app.getNetworkAgentConfig());
    }

    async init()
    {
        this._showWelcome();
        await this.app.init();
        this._setupUI();
    }

    _setupUI()
    {
        this.readline = Readline.createInterface({input: process.stdin, output: process.stderr});

        this.readline.on("SIGINT", () => {
            console.error("Ouch! Exiting & cleaning up...");
            this.shutdown();
            return;
        });

        // TODO: howto connect/disconnect to Storage if not autoconnect is set?
        this.readline.on("line", (input) => {
            if (input == "/refresh") {
                this._refresh(30, null, true);
                return;
            }
            else if (input == "/connect") {
                this.app.connectNetwork();
                return;
            }
            else if (input == "/disconnect") {
                this.app.disconnectNetwork();
                this.logger.info("Stopping Network Agent and closing connections to peers...");
                return;
            }
            else if (input == "/quit") {
                console.error("Exiting & cleaning up... Bye!");
                this.shutdown();
                return;
            }
            else if (input.startsWith("/profile ") && input.length > 9) {
                const name = input.slice(9);
                this._saveProfile(name);
                return;
            }

            if (input === "") {
                return;
            }
            if (input.startsWith("/")) {
                console.error(`<Unknown command: ${input.slice(1)}>`);
                return;
            }

            // Position the cursor to overwrite our input with the rendered line
            Readline.moveCursor(process.stderr, 0, -1);

            this._sendMessage(input);
        });
    }

    shutdown()
    {
        this.readline.close();
        this.app.shutdown();
    }

    _showWelcome()
    {
        console.error(`

Welcome to the experimental Universe Chat!  A shared place for everybody you sync with.

Commands:
    /connect            Connect to configured peers
    /disconnect         Disconnect from all peers
    /refresh            Show latest history (pagination not supported atm by the app)
    /profile <name>     Set your profile name
    /quit               Resign from your job and move to the forest
    CTRL-C              Same as /quit, but also burn all your bridges out the door

Type a message to send. It will be stored locally and synced when connected.
`);
    }

    /**
     * Fetch message history from storage.
     *
     * @param {number | null} limit max messages to get
     * @param {string | null} cursorNodeId last gotten node ID, use for pagination
     * @param {boolean} fromNewest set to true to get from newest
     */
    async _refresh(limit, cursorNodeId, fromNewest)
    {
        if (!this.app.isStorageConnected()) {
            console.error(`<error: storage is not connected>`);
            return;
        }

        // Criterias to get nodes and blobs one level from root node.
        const depth = 1;
        const criteria = {
            0: {
                discard: true
            },
            1: {
                limit: limit,
                cursorNodeId: cursorNodeId,
            }
        };

        const ordering = fromNewest ? {direction: "desc"} : null;

        const asyncRet = await this.app.getStorageClient().fetch(this.appConfig.rootNodeId, depth, criteria, ordering);
        const data = asyncRet.getProps();

        if (fromNewest) {
            // Reverse the set of nodes for display purposes.
            data.nodes.reverse();
        }

        if (data.nodes.length > 0) {
            console.error("<Showing history>");
        }
        else {
            console.error("<No history>");
        }

        this._processData(data);
    }

    /**
     * Process data incoming from storage, either from sync or from subscription.
     *
     * Note: that for a solid user experience this function needs to be wrapped
     * so that it does not just roll out all info put to it, because that can
     * get quite messy when connecting and syncing with multiple peers.
     * Together with _refresh/fetch one could build a usable history for browsing.
     *
     * @param {object<nodes, blobs, deletedNodes, deletedBlobIds>} data
     */
    _processData(data)
    {
        if (!data || !data.nodes) {
            return;
        }

        // Fetch readline
        const line = this.readline.line;
        this.readline.pause();
        Readline.clearLine(process.stderr, 0);
        Readline.cursorTo(process.stderr, 0);

        try {
            data.nodes.forEach( node => {
                if (node.getContentType() === "u.types.message") {
                    this._renderMessage(node, AppUtil.filterBlobs(node, data.blobs));
                }
                else if (node.getContentType() === "u.types.profile") {
                    this._updateProfile(node);
                }
            });

            if (data.deletedNodes) {
                // Remove these messages from screen, if applicable.
                console.error(`<${data.deletedNodes.length} messages deleted>`);
            }
        }
        catch(e) {
            const err = typeof e === "object" ? e.stack || e.message || e : e;
            this.logger.info("Error in _processData", err);
        }

        process.stderr.write(line);
        this.readline.resume();
    }

    /**
     * Render one message on screen.
     *
     * @param {Node} node
     * @param {Blob[]} [blobs]
     */
    _renderMessage(node, blobs)
    {
        const time = new Date(node.getCreationTime()).toLocaleString();
        const senderAlias = this._getSenderAlias(node.getCreatorPubKey());
        const direction = node.getCreatorPubKey() === this.appConfig.keyPair.pub ? "<" : ">";
        const message = node.getDataString();

        console.log(`${time}: ${senderAlias} ${direction} ${message}`);
    }

    /**
     * Transform a public key to an alias.
     */
    _getSenderAlias(pubKey)
    {
        if (pubKey === this.appConfig.keyPair.pub) {
            return "(me)";
        }

        const o = this.profiles[pubKey];
        if (o) {
            return `${o.name}`;
        }

        return `(key:${pubKey.slice(0, 6)})`;
    }


    async _sendMessage(message)
    {
        if (!this.app.isStorageConnected()) {
            console.error(`<error: storage is not connected>`);
            return;
        }

        const now = Date.now();

        const node = NodeFactory.new();
        node.setContentType("u.types.message");
        node.setDataString(message);
        node.setCreationTime(now);
        node.setParentId(this.appConfig.rootNodeId);
        const nodeSigned = node.sign(this.appConfig.keyPair);

        this._renderMessage(nodeSigned);

        const nodeId = nodeSigned.getId();
        const expire = this.appConfig.config.expire ? (now + this.appConfig.config.expire * 1000) : null;
        const maxIssue = this.appConfig.config.maxIssue;

        // TODO: adapt to multireceipt when it is released.

        const receipts = [];
        if (this.appConfig.config.type === "server") {
            // Issue to ourselves, and it will get extended to server and peer (maxIssue at least set to 3).
            const receipt = AppUtil.createReceipt(nodeId, now, expire, maxIssue, this.appConfig.keyPair.pub, this.appConfig.keyPair);
            receipts.push(receipt);
        }
        else {
            // p2p mode
            // Since we don't have multi receipt yet we create two receipts.
            // First: just for ourselves
            const receipt = AppUtil.createReceipt(nodeId, now, expire, 1, this.appConfig.keyPair.pub, this.appConfig.keyPair);
            receipts.push(receipt);
            // Second: To our peer(s)
            receipts.push(... this.targetPubKeys.map( pubKey => AppUtil.createReceipt(nodeId, now, expire, maxIssue, pubKey, this.appConfig.keyPair) ) );
        }

        const ret = await this.app.getStorageClient().store({nodes: [nodeSigned], receipts});
    }

    /**
     * Save users profile name.
     * This can be done muliple times, it is the latest one which is active.
     */
    async _saveProfile(name)
    {
        if (!this.app.isStorageConnected()) {
            console.error(`<error: storage is not connected>`);
            return;
        }

        console.error(`<Setting profile name to "${name}">`);

        const now = Date.now();
        const node = NodeFactory.new();
        node.setContentType("u.types.profile");
        node.setPublicLicense("Free");
        node.setName(name);
        node.setCreationTime(now);
        node.setParentId(this.appConfig.rootNodeId);
        const nodeSigned = node.sign(this.appConfig.keyPair);

        const nodeId = nodeSigned.getId();

        this.app.getStorageClient().store({nodes: [nodeSigned]});
    }

    /**
     * Update the profile in memory
     */
    _updateProfile(node)
    {
        const pubKey    = node.getCreatorPubKey();
        const ts        = node.getCreationTime();
        const ts0       = (this.profiles[pubKey] || {})["ts"] || 0;
        if (ts > ts0 && node.getName()) {
            this.profiles[pubKey] = {ts: ts, name: node.getName()};
        }
    }
}

module.exports = MessagingApp;
