//    Copyright 2017 Kura
// 
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
// 
//        http://www.apache.org/licenses/LICENSE-2.0
// 
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.


const path = require("path")
const fs = require("fs")
const npminstall = require("npminstall")
const cp = require("child_process")
const download = require("download")
const readline = require("readline")
const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    prompt: "> ",
})

const exec = require("execa")

const home = process.env.HOME || process.env.USERPROFILE || __dirname

function isNewVersion(a, b) {
    const as = a.split('.');
    const bs = b.split('.');

    const diff = as.length - bs.length;
    if (diff > 0) {
        while (diff > 0) {
            bs.push(0);
            diff--;
        }
    } else if (diff < 0) {
        while (diff < 0) {
            as.push(0);
            diff++;
        }
    }

    for (let idx = 0; idx < as.length; idx++) {
        if (as[idx] === bs[idx]) continue;
        return +as[idx] < +bs[idx] ? true : false
    }
}

function which(file) {
    const ext = (process.platform === "win32" || process.platform === "win64")? ".exe": ""
    const epath = process.env.PATH
    const lookup = epath.split(path.delimiter)

    for (let lookup of epath.split(path.delimiter)) {
        if (fs.existsSync(path.join(lookup, file + ext))) {
            return path.join(lookup, file + ext)
        }
    }

    return null
}

function ensureNode(at) {
    process.env.PATH = process.env.PATH + path.delimiter + at
    const ext = (process.platform === "win32" || process.platform === "win64")? ".exe": ""

    const node = which("node")
    
    if (!node) {
        rl.write("  - downloading node, this could take some time, please wait...\n")
        let platform = process.platform
        let archive = ".tar.gz"
        if (platform.substr(0, 3) === "win") {
            platform = "win"
            archive = ".zip"
        }

        return download("https://nodejs.org/dist/v8.4.0/node-v8.4.0-" + platform + "-" + process.arch + archive, 
            path.join(at), {extract: true, strip: 1})
        .then(() => path.join(at, "node" + ext))
    }

    return Promise.resolve(node)
}

rl.question(`Where should DI be installed to?\nDefault path is <${home}/DI>\n> `, answer => {
    if (!answer) answer = path.join(home, "DI")
    let version = false
    let update = false

    rl.write(`Installing DI to <${answer}>\n`)
    if (fs.existsSync(answer) && fs.existsSync(path.join(answer, "package.json"))) {
        const pkg = require(path.join(answer, "package"))
        version = pkg.version
        update = true
    }

    if (update) rl.write("  - detected existing installation, updating instead...\n")
    rl.write("  - fetching latest version...\n")
    download("https://api.github.com/repos/DiscordInjections/DiscordInjections/releases/latest")
    .then(buffer => JSON.parse(buffer.toString()))
    .then(json => {
        const remoteVersion = json.tag_name
        if (update && !isNewVersion(version, remoteVersion)) {
            rl.write("  - remote version is not newer, skipping download...\n")
            return null
        } else {
            rl.write(`  - downloading DI v${remoteVersion}\n`)
            return download(json.zipball_url, answer, { extract: true, strip: 1 })
        }
    })
    .then(() => {
        const pkg = require(path.join(answer, "package"))
        version = pkg.version
        rl.write(`    detected DI v${version}\n`)
    })
    .then(() => {
        rl.write(`  - checking for node...\n`)
        const at = path.join(process.env.APPDATA || "/tmp", "node")
        return ensureNode(at).then(exe => {
            const v = exec.sync(exe, ["-v"])
            rl.write(`    found node ${v.stdout}\n`)
            return exe
        })
    })
    .then(exe => {
        rl.write("  - installing/updating dependencies, this could take a few minutes...\n")
        const ext = process.platform.substr(0, 3) === "win" ? ".cmd" : ""
        return exec(path.join(exe, "..", "npm" + ext), ["install"], { cwd: answer, env: process.env, shell: true, stdio: 'ignore' }).then(() => exe)
    })
    .then(exe => {
        rl.write(`  - installing plugin dependencies, this could take a few minutes... (just rerun this tool to install new plugin dependencies)\n`)
        return exec(exe, ["install-plugins"], { cwd: answer, env: process.env, stdio: 'inherit' }).then(() => exe)
    })
    .then(exe => {
        rl.close()
        if (!update) {
            console.log(`  - running injection script...\n`)
            return exec(exe, ["install", "inject"], { cwd: answer, env: process.env, stdio: 'inherit' })
        }
    })
    
    .catch(ex => {
        console.error("Failed to install DI, the error was", ex)
    })

    .then(() => console.log("Successfully installed DI :)"))
})