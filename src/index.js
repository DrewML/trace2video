const { join } = require('path');
const fs = require('fs');
const tempy = require('tempy');
const execa = require('execa');
const pify = require('util').promisify;

// Use require('fs').promises when node 12
// is LTS (ugly warnings in current LTS version)
const writeFile = pify(fs.writeFile);

module.exports = async (entries, videoBasename) => {
    const screenshotEntries = entries.filter(
        e => e.cat === 'disabled-by-default-devtools.screenshot',
    );

    let lastPointer;
    const timings = [];

    // Each screenshot has a main thread timestamp
    // that can be used to derive timing info for frames
    // by comparing the start time of a screenshot to
    // the start time of the next screenshot entry in line
    for (const screenshot of screenshotEntries) {
        let microseconds;
        if (lastPointer) {
            microseconds = screenshot.ts - lastPointer.ts;
            // microseconds -> seconds
            timings.push(microseconds / 1000000);
        }

        lastPointer = screenshot;
    }

    let configBuffer = [];
    const outputRoot = tempy.directory();

    for (const [index, screenshot] of screenshotEntries.entries()) {
        const seconds = timings.shift();
        const image = Buffer.from(screenshot.args.snapshot, 'base64');
        const imagePath = join(outputRoot, `capture-${index}.jpg`);
        await writeFile(imagePath, image);

        configBuffer.push(`file '${imagePath}'`);
        configBuffer.push(`duration ${seconds || 0}`);
    }

    const concatConfigPath = join(outputRoot, 'input.txt');
    await writeFile(concatConfigPath, configBuffer.join('\n'));
    await stitchFrames(concatConfigPath, videoBasename);

    return concatConfigPath;
};

async function stitchFrames(concatConfigPath, videoBasename) {
    const cmd = `ffmpeg -y -f concat -safe 0 -i ${concatConfigPath} -vsync vfr -pix_fmt yuv420p ${videoBasename}.mp4`;
    await execa.command(cmd);
}
