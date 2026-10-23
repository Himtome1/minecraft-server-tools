# minecraft-server-tools

Free Minecraft server tools: RAM calculator, MOTD generator and server status checker. Plain JavaScript, no dependencies.

| Tool | What it does | Live |
| --- | --- | --- |
| [`ram-calculator/`](ram-calculator/) | Pick a modpack and how many people play, get a RAM size to start from and the reason for it. Reference sizes come with their sources in `data.json`. | [Use it](https://packyard.ca/tools/minecraft-server-ram-calculator) |
| [`motd-generator/`](motd-generator/) | Write a coloured MOTD, preview it as the server list draws it, and copy it for `server.properties`, as plain § text or as MiniMessage. | [Use it](https://packyard.ca/tools/minecraft-motd-generator) |
| [`server-status/`](server-status/) | Check whether a Java Edition server is online with a real Server List Ping, with an SSRF guard and rate limits for running it on a public site. | [Use it](https://packyard.ca/tools/minecraft-server-status) |

These tools run on [Packyard](https://packyard.ca).

## Run locally

You need Node.js 20 or newer. There's nothing to install.

```sh
npm start          # serves the RAM calculator and MOTD generator on http://localhost:8080
npm test           # runs every test (node --test)
```

You can also open `motd-generator/index.html` straight from disk.

To check a server from the command line:

```sh
cp server-status/.env.example server-status/.env   # then put your own IPs in TOOLS_BLOCK_IPS, or leave it empty
node --env-file=server-status/.env server-status/cli.mjs play.example.com
```

## How the status checker stays safe

- It looks up the SRV record the way the vanilla client does, resolves the name once and connects to that exact IP, so DNS rebinding can't happen.
- It refuses loopback, private, CGNAT, link-local, multicast and reserved addresses before it connects, plus anything in `TOOLS_BLOCK_IPS`.
- Each check uses one connection, with a 3 s connect timeout, 5 s in total and a 64 KB reply cap.
- Per client it allows 10 checks a minute and one at a time, with a global cap. Results are cached in memory for 60 s.
- Replies never include an IP address or the player sample list.

## License

MIT. See [LICENSE](LICENSE).

Packyard is not an official Minecraft product. It is not approved by or associated with Mojang or Microsoft.
