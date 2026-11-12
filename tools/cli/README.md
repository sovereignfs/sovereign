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

## Backups

```bash
./sv backup                    # the whole instance, encrypted to your keys, into .backups/
./sv backup --core             # core alone; --app NAME (again for more) for apps
./sv backup --unencrypted      # a plain .tar in .backups/unsafe/, after a warning
./sv restore .backups/FILE     # put it back; --core or --app NAME for one part
```

`.backups/` is git-ignored: a backup is never committed. It is opened by your key, `~/.config/sovereign/age.key`, and by no
other: keep a copy of that key offline, and add a second one with `./sv key recovery`, which you keep apart from this machine.
A backup taken after that opens with either (`./sv restore FILE --key recovery.key`). Re-keying does not re-encrypt the
backups you already have.

What it does and how: [the specification](https://github.com/sovereignfs/sovereign/blob/main/docs/specs/operator-cli.md). Licence:
AGPL-3.0-or-later.
