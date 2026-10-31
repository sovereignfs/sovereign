# @sovereignfs/cli

`sv`, the operator toolkit for [Sovereign](https://github.com/sovereignfs/sovereign): it deploys core, with or without apps, to one
machine that has Docker, from an instance repository you keep in git.

You do not install it globally. `npm create @sovereignfs` makes an instance repository that pins this package, and `./sv` in that
repository runs the version it pins.

```bash
npm create @sovereignfs my-instance
cd my-instance
./sv setup             # the domain, the server, how to deploy
./sv server bootstrap  # prepare a fresh machine
./sv push              # check, commit and push
./sv deploy            # put it on the server
```

What it does and how: [the specification](https://github.com/sovereignfs/sovereign/blob/main/docs/specs/operator-cli.md). Licence:
AGPL-3.0-or-later.
