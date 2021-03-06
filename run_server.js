#!/usr/bin/env node

/**
 * Usage:
 *  ./run_server.js server.json
 *
 * The server.json config file must conform to the ApplicationConfig specified in App.js.
 *
 */
const {App} = require("@universe-ai/core");
const MessagingProtocolSpec = require("./MessagingProtocolSpec");
const {Logger} = require("@universe-ai/util");

function run()
{
    const configFilePath = process.argv[2] || "./server.json";
    const serverConfig = {};

    const loggerId = `MessagingSever`;
    const logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

    /* We run the base app just to get the Protocol instance connected,
     * we do not need a MessagingApp instance since the server is non-interactive
     * and it is just meant to do its work as defined by the protocol spec. */
    const app = new App(configFilePath, serverConfig, MessagingProtocolSpec, logger);
    app.init();
}

run();
