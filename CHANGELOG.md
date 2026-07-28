# [3.2.0](https://github.com/homer0/codebox/compare/3.1.0...3.2.0) (2026-07-28)


### Features

* install configured box packages at startup ([c826ce7](https://github.com/homer0/codebox/commit/c826ce704bbf8f67aa88b25611308cb3bd693da6))

# [3.1.0](https://github.com/homer0/codebox/compare/3.0.0...3.1.0) (2026-07-26)


### Bug Fixes

* add override for tar-fs ([37cb2a7](https://github.com/homer0/codebox/commit/37cb2a783f6f5f0af12cc1ec0706d821e028de38))
* include workspace config and halt failed image builds ([3a9172a](https://github.com/homer0/codebox/commit/3a9172a4e4a99ab877441a05b010518f6e0e9cf4))


### Features

* expose allowlisted environment variables to SSH ([33e2327](https://github.com/homer0/codebox/commit/33e23276fb897750885306a129927918b8598a5a))

# [3.0.0](https://github.com/homer0/codebox/compare/2.0.3...3.0.0) (2026-07-26)


### Bug Fixes

* add corepack ([041d67d](https://github.com/homer0/codebox/commit/041d67da2e3056b47196124bcf64bfe0c18c83f2))
* add dsf alias to git ([da86a9a](https://github.com/homer0/codebox/commit/da86a9a7fd72f9b6922b5a261462105bb7e05d31))
* exclude SSH keys from Docker build context ([c5927c5](https://github.com/homer0/codebox/commit/c5927c5e10e87d17896b793a0168dffb736746e4))
* expose fnm path ([c44a3dc](https://github.com/homer0/codebox/commit/c44a3dcf0fca9e8888c783f5d4fea7d92f51f186))
* generate SSH host keys at startup ([795058d](https://github.com/homer0/codebox/commit/795058da70a67c112f0d24c6f8bd1747f2d642fb))
* install global tools for each Node version ([052ded4](https://github.com/homer0/codebox/commit/052ded4ac81a13c3a78406a419c3d8fbda3a1a53))
* install jq ([f176986](https://github.com/homer0/codebox/commit/f176986e32c8709b167b38bcfb76e93148cbbfe7))
* install unzip for fnm ([f10cea2](https://github.com/homer0/codebox/commit/f10cea2748e8ff823dd240381f6ff5e4c047c11c))
* migrate from nvm to fnm ([c6a37fd](https://github.com/homer0/codebox/commit/c6a37fdd0b38ebc0112d60893b00733a401dd144))
* move to esm ([99e256c](https://github.com/homer0/codebox/commit/99e256c44f6c7fa226ba70141fcc315a792f97e6))
* pin code-server image ([5586fb8](https://github.com/homer0/codebox/commit/5586fb80150a12a723676b0d1f195ad18d70f9d3))
* remove redundant locale generation ([44a5a82](https://github.com/homer0/codebox/commit/44a5a82c0089c331bd2ef72bd5b8d16e9b955aef))
* remove trailing slash ([fff3b8c](https://github.com/homer0/codebox/commit/fff3b8c359c45e4ae98367ab43e328ad2123878d))
* remove unsupported HTTPS port mapping ([da7867a](https://github.com/homer0/codebox/commit/da7867af8bb5e0feb5aedcf72d3b1489b97616f3))
* set default node version to 24 ([4ad458d](https://github.com/homer0/codebox/commit/4ad458d1488e47df53ce53c81c27412481182f7a))
* set node version to 24 ([ec1497a](https://github.com/homer0/codebox/commit/ec1497a7ff07fe01c554a0bda4f885d0685a5d89))
* specify where fnm is installed ([69e47eb](https://github.com/homer0/codebox/commit/69e47eb47cf7916df81e7c2ab68a8568263a09d9))
* update aliases ([a9aee54](https://github.com/homer0/codebox/commit/a9aee544d6c4866efa939dcc833de9c9daa37086))
* update and auth ngrok ([1fee30e](https://github.com/homer0/codebox/commit/1fee30e9897725dd5c918b7686e7bd1a5697b65c))
* update code-server startup integration ([d5e853b](https://github.com/homer0/codebox/commit/d5e853b8ba42930bcdda3bf91cdd5c1740208ed8))
* update corepack setup ([8beb16e](https://github.com/homer0/codebox/commit/8beb16ef19a76443ab6212374a6bad4976c7c77a))
* update eslint config ([13d13e8](https://github.com/homer0/codebox/commit/13d13e8bc775ebf8bebe599ba9b0015064299c5a))
* update lockfile ([4aea127](https://github.com/homer0/codebox/commit/4aea12742b297b503d151d1c3780bd19283d1820))
* update vscode extensions ([e39933b](https://github.com/homer0/codebox/commit/e39933b47fa4b23c2185d849de9ea205c294569c))
* use .node-version instead of .nvmrc ([2ac2841](https://github.com/homer0/codebox/commit/2ac2841bdbad81d7e2c16552ecbc78fada992604))
* use debian image as base ([990aff3](https://github.com/homer0/codebox/commit/990aff335fa922662b3c8aaae4be5f1c4144a0e6))
* use new env syntax ([4dfcf67](https://github.com/homer0/codebox/commit/4dfcf675442f8e59f46aa90805ffcd5ab016e38a))


### BREAKING CHANGES

* nvm is no longer installed, it now uses fnm

## [2.0.3](https://github.com/homer0/codebox/compare/2.0.2...2.0.3) (2024-04-07)


### Bug Fixes

* update all dependencies ([b71d152](https://github.com/homer0/codebox/commit/b71d152885d72798626f7843346f3685112e3e02))

## [2.0.2](https://github.com/homer0/codebox/compare/2.0.1...2.0.2) (2024-03-30)


### Bug Fixes

* install ngrok ([b952e04](https://github.com/homer0/codebox/commit/b952e04a6259405e7dedc113657e61005af01935))

## [2.0.1](https://github.com/homer0/codebox/compare/2.0.0...2.0.1) (2024-03-30)


### Bug Fixes

* enable PAM to fix SSH ([7508258](https://github.com/homer0/codebox/commit/75082583146a2910aa9534928ade807d23b4a138))

# [2.0.0](https://github.com/homer0/codebox/compare/1.1.1...2.0.0) (2024-03-29)


### Bug Fixes

* ensure prod env before installing deps ([0711eed](https://github.com/homer0/codebox/commit/0711eedd7c9b2be8e76a084de8dd9ae36c101c4c))
* update base Node versions to 18 and 20 ([1aa3a1a](https://github.com/homer0/codebox/commit/1aa3a1ab15fdc5215d4781b1ee01ff80888976a2))


### BREAKING CHANGES

* Node 14 and 16 were removed from the box

# [2.0.0](https://github.com/homer0/codebox/compare/1.1.1...2.0.0) (2024-03-29)


### Bug Fixes

* ensure prod env before installing deps ([0711eed](https://github.com/homer0/codebox/commit/0711eedd7c9b2be8e76a084de8dd9ae36c101c4c))
* update base Node versions to 18 and 20 ([1aa3a1a](https://github.com/homer0/codebox/commit/1aa3a1ab15fdc5215d4781b1ee01ff80888976a2))


### BREAKING CHANGES

* Node 14 and 16 were removed from the box

## [1.1.1](https://github.com/homer0/codebox/compare/1.1.0...1.1.1) (2022-07-14)


### Bug Fixes

* change pwa manifest ([73929cc](https://github.com/homer0/codebox/commit/73929ccd480bf93e2f40f80219b992173d1c3a99))
* stop using wootils ([20d252a](https://github.com/homer0/codebox/commit/20d252a5e9cde1963260de58a6e295e85389ba0c))

# [1.1.0](https://github.com/homer0/codebox/compare/1.0.2...1.1.0) (2022-07-13)


### Bug Fixes

* add missing dockerignore ([bf563da](https://github.com/homer0/codebox/commit/bf563da90964bfd932b4f81ec91c28233353ea65))
* change replace logic for the entrypoint ([90bcb78](https://github.com/homer0/codebox/commit/90bcb7896bfb07800c5ea06d82b0f8adcbde2984))
* remove Node 12 from nvm ([a5cf31e](https://github.com/homer0/codebox/commit/a5cf31e396bee2cf24f42e5ec5adac7d87fb7ba7))
* upgrade vsx files for the dev box ([4a2f86c](https://github.com/homer0/codebox/commit/4a2f86c7526f080ad18c965894715054e41d54f7))
* use ENTRYPOINTD ([20ff072](https://github.com/homer0/codebox/commit/20ff07291c7cac2bafce2a17c3221a4b6e7c4842))


### Features

* add support for custom icons ([5975f2d](https://github.com/homer0/codebox/commit/5975f2db7b6d50fd07da7818cf4e658a487913d2))

## [1.0.2](https://github.com/homer0/codebox/compare/1.0.1...1.0.2) (2022-03-30)


### Bug Fixes

* debug the docker release ([a020036](https://github.com/homer0/codebox/commit/a02003631f83d416f5b4c264009d6df1fc67d8c1))

## [1.0.1](https://github.com/homer0/codebox/compare/1.0.0...1.0.1) (2022-03-30)


### Bug Fixes

* apply the git user data ([247391e](https://github.com/homer0/codebox/commit/247391e3d5e7cee297dbf1f2401236869fb1462b))

# 1.0.0 (2022-03-20)


### Bug Fixes

* add scripts to install and run the CLI ([dd09828](https://github.com/homer0/codebox/commit/dd0982854f0b16a9e05dba231e1c71c72becac66))
* add support for hashed-password in the utility ([ce18113](https://github.com/homer0/codebox/commit/ce18113862b68c1786acd012b07e7f78ca82525f))
* load nvm directly ([89685d3](https://github.com/homer0/codebox/commit/89685d3109ac0ca16b3d6dfd55d3a2dcd5ffa73f))
* never log undefined ([d1b60d9](https://github.com/homer0/codebox/commit/d1b60d90f5987838129fdaa3fbc9c76a9f41d28f))
* only create config.yaml if it doesn't exist ([8a20b32](https://github.com/homer0/codebox/commit/8a20b32f7016bd972b438716c76a71ed178b154d))
* only install prod deps for the CLI ([e35ac32](https://github.com/homer0/codebox/commit/e35ac321d3cdcb235424b54913557998b7138f29))
* only run prepare script on dev ([428bad0](https://github.com/homer0/codebox/commit/428bad0d572bb3d3d53334ebebacb3406fad7589))
* remove Copilot for now ([a505780](https://github.com/homer0/codebox/commit/a505780e0e462c74faf07ee7edccd634079c5c65))
* remove unnecessary aliases ([979e66e](https://github.com/homer0/codebox/commit/979e66eb95caf4ca157ef8fa8bbe13016ce0c8e3))
* remove unnecessary instruction ([d091407](https://github.com/homer0/codebox/commit/d091407ec54b8b90297c55c11aa6b6abdf6b850b))
* replace env and utils with the CLI ([93ea1ac](https://github.com/homer0/codebox/commit/93ea1ac4be24de3cf7cddf98bb18f7d17b2ee41b))
* setup locales ([064682f](https://github.com/homer0/codebox/commit/064682faa0a36859d1da6680cd77db0c58846c16))
* stop replacing zsh theme in the Dockerfile ([846ac87](https://github.com/homer0/codebox/commit/846ac873ab2973d2f6c9cf8a2d024bb5a8116145))
* write code-server config with CLI ([39848c4](https://github.com/homer0/codebox/commit/39848c4bd8d67c5f1999b06fba0f5c2b2e6cf06c))


### Features

* add initial setup for the box ([d02c55d](https://github.com/homer0/codebox/commit/d02c55d80df1a0ea2fb949f09ec7adf88fcb08de))
* allow custom domain ([74e629e](https://github.com/homer0/codebox/commit/74e629e8e64452739a3bfe98a06da69b2e002b76))
* allow for custom label on the terminal ([9085af5](https://github.com/homer0/codebox/commit/9085af5d1d8051eda7ad826380e64f0d8d030cde))
* copy vscode keybindings ([d3ea10d](https://github.com/homer0/codebox/commit/d3ea10d40aef653bc949b01dafb1f54b265e6185))
* copy vscode user settings ([1789370](https://github.com/homer0/codebox/commit/1789370c01fa28ff7d44c04daa9217f3256b51c7))
* install vscode extensions ([0399b5d](https://github.com/homer0/codebox/commit/0399b5d6cd70935f5c78a6f5fbad75ba5f84ded2))
* remove the need for build args ([82ee108](https://github.com/homer0/codebox/commit/82ee10890d97a94afd596416b83311a6e1b85297))
* setup all Node LTS versions ([9941b0b](https://github.com/homer0/codebox/commit/9941b0bb7b5bbf01b0017d39b24d1a37f3cee7db))
* setup code-server ([e083ae3](https://github.com/homer0/codebox/commit/e083ae328258433b6ca1159c9de321b72be54d9b))
* setup nginx ([7ffdcbf](https://github.com/homer0/codebox/commit/7ffdcbf40456c12707fedf33fd1d5ac0f6ae405b))
