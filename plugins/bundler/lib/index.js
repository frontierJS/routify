import { Node } from '../../../lib/node.js' //eslint-disable-line
import fse, { ensureDirSync } from 'fs-extra'
import { relative, resolve } from 'path'

const { writeFile } = fse
const relativeUnix = (path, path2) => relative(path, path2).replace(/\\/g, '/')

class Bundles {
    constructor (outputDir) {
        this.outputDir = outputDir
    }

    /** @type {Object.<string, Bundle} */
    bundles = {}

    /** @param {Node} node */
    upsert (node) {
        const { path } = node.file
        this.bundles[path] =
            this.bundles[path] ||
            new Bundle(node, this.outputDir)
        return this.bundles[path]
    }
    async apply () {
        const promises = Object.values(this.bundles)
            .map(bundle => bundle.apply())
        return Promise.all(promises)
    }
}

class Bundle {
    /** @type {Node[]} */
    members = []

    /**
     * @param {Node} node
     * @param {string} outputDir
     * */
    constructor (node, outputDir) {
        this.outputDir = outputDir
        this.instructor = node
        this.filename = node.id + '-bundle.js'
    }

    include (node) {
        this.members.push(node)
    }

    async apply () {
        ensureDirSync(this.outputDir)
        const output = resolve(this.outputDir, this.filename)

        const exportStr = this.members
            .map(node => `export { default as ${node.id} } from '${relativeUnix(this.outputDir, node.component)}'`)
            .join('\n')

        this.members.forEach(node => {
            node.component = `import("${this.filename}").then(r => r.${node.id})`
        })
        await writeFile(output, [exportStr].join('\n'))
    }
}

const bundleIsNotNullOrUndefined = val => ![null, undefined].includes(val.meta.bundle)

/**
 *
 * @param {Node} node
 * @param {any} outputDir
 */
export const createBundles = async (node, outputDir) => {
    const bundles = new Bundles(outputDir)

    // iterate node and its descendants
    for (node of [node, ...node.descendants]) {
        // look for nearest instructions in node and its ancestors
        const bundleInstructionsNode = [node, ...node.ancestors].find(bundleIsNotNullOrUndefined)

        const isEnabled = bundleInstructionsNode && bundleInstructionsNode.meta.bundle
        if (isEnabled) {
            const bundle = bundles.upsert(bundleInstructionsNode)
            bundle.include(node)
        }
    }

    await bundles.apply()
}

