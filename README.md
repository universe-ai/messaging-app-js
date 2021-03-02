# Universe Chat

This example project come with two configured users and a server.

This chat app is preconfigured to be run in two separate modes, either as 1) direct peer-to-peer mode, or 2) using a central server for message relaying.

The peer-to-peer could be extended to work in a federated fashion if the `maxIssue` of receipt is increased so data can travel further.

## Current status
This is a working prototype, but have in mind that Universe does yet not support data encrypted at rest or targeted at a specific user, meaning that anything else than direct p2p with encrypted connections is not safe from spying.  

So don't share your most inner secrets using this chat, just yet.

## Configure users
See the files `userX.json`, `userX-p2p.json` and `server.json`.

## Run

### Run as peer-to-peer
```sh
./run.js user1-p2p.json
```

```sh
./run.js user2-p2p.json
```

### Run using central server
```sh
./run_server.js server.json
```

```sh
./run.js user1.json
```

```sh
./run.js user2.json
```

## Debugging
Set the `LOG_LEVEL` environment variable for verbose logging:
```
LOG_LEVEL="debug" ./run_server.js server.json
```
