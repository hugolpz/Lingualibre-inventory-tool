#!/usr/bin/env node
// xml-slicer.cjs - Report XML statistics and optionally split revisions into files
//
// USAGE:
//   node xml-slicer.cjs --path ./xml/{file}.xml
//   node xml-slicer.cjs --path ./xml/{file}.xml --slices 4
//   node xml-slicer.cjs --path ./xml/{file}.xml --max_size 50
//
// OPTIONS:
//   -h, --help       Show this help message
//   --path <file>    XML file to inspect
//   --slices <n>     Split revisions into n files in ./slices
//   --max_size <n>   Split into size-balanced files of approximately n MB

const fs = require('fs');
const path = require('path');

function showHelp() {
    const lines = fs.readFileSync(__filename, 'utf8').split('\n');
    const helpLines = [];
    for (const line of lines) {
        if (line.startsWith('//')) {
            helpLines.push(line.replace(/^\/\/ ?/, ''));
        } else if (helpLines.length) {
            break;
        }
    }
    console.log(helpLines.join('\n'));
}

function fail(message) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
}

function readOption(args, name) {
    const index = args.indexOf(name);
    if (index === -1) {
        const equalsArgument = args.find((arg) => arg.startsWith(`${name}=`));
        return equalsArgument ? equalsArgument.slice(name.length + 1) : undefined;
    }
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
        fail(`${name} requires a value`);
    }
    return args[index + 1];
}

function parsePositiveNumber(value, optionName) {
    const number = Number(value.replace(/mb$/i, ''));
    if (!Number.isFinite(number) || number <= 0) {
        fail(`${optionName} must be a positive number`);
    }
    return number;
}

function findTagEnd(xml, start) {
    let quote = null;
    for (let index = start; index < xml.length; index += 1) {
        const character = xml[index];
        if (quote) {
            if (character === quote) quote = null;
        } else if (character === '"' || character === "'") {
            quote = character;
        } else if (character === '>') {
            return index;
        }
    }
    return -1;
}

function validateXml(xml, filePath) {
    const stack = [];
    let index = 0;

    while (index < xml.length) {
        const tagStart = xml.indexOf('<', index);
        if (tagStart === -1) break;

        if (xml.startsWith('<!--', tagStart)) {
            const end = xml.indexOf('-->', tagStart + 4);
            if (end === -1) fail(`Invalid XML in ${filePath}: unclosed comment`);
            index = end + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', tagStart)) {
            const end = xml.indexOf(']]>', tagStart + 9);
            if (end === -1) fail(`Invalid XML in ${filePath}: unclosed CDATA section`);
            index = end + 3;
            continue;
        }

        const tagEnd = findTagEnd(xml, tagStart + 1);
        if (tagEnd === -1) fail(`Invalid XML in ${filePath}: unclosed tag`);
        const tag = xml.slice(tagStart + 1, tagEnd).trim();
        if (tag.startsWith('?') || tag.startsWith('!')) {
            index = tagEnd + 1;
            continue;
        }

        const closing = tag.startsWith('/');
        const selfClosing = tag.endsWith('/');
        const tagName = (closing ? tag.slice(1) : tag).replace(/\/$/, '').trim().match(/^[^\s/>]+/);
        if (!tagName) fail(`Invalid XML in ${filePath}: malformed tag`);

        if (closing) {
            if (stack.pop() !== tagName[0]) {
                fail(`Invalid XML in ${filePath}: mismatched closing tag </${tagName[0]}>`);
            }
        } else if (!selfClosing) {
            stack.push(tagName[0]);
        }
        index = tagEnd + 1;
    }

    if (stack.length) fail(`Invalid XML in ${filePath}: unclosed <${stack[stack.length - 1]}>`);
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
}

const sourcePath = readOption(args, '--path');
if (!sourcePath) fail('missing --path option');

const slicesOption = readOption(args, '--slices');
const maxSizeOption = readOption(args, '--max_size');
let sliceCount;
if (slicesOption !== undefined) {
    sliceCount = Number(slicesOption);
    if (!Number.isInteger(sliceCount) || sliceCount < 1) {
        fail('--slices must be a positive integer');
    }
}
const maxSizeMb = maxSizeOption === undefined
    ? undefined
    : parsePositiveNumber(maxSizeOption, '--max_size');

let xml;
try {
    xml = fs.readFileSync(path.resolve(sourcePath), 'utf8');
} catch (error) {
    fail(`cannot read ${sourcePath}: ${error.message}`);
}

const revisions = xml.match(/<revision\b[\s\S]*?<\/revision>/g) || [];
const firstRevision = xml.indexOf('<revision');
const lastRevisionEnd = revisions.length
    ? xml.lastIndexOf('</revision>') + '</revision>'.length
    : -1;

console.log(`Path: ${sourcePath}`);
console.log(`Lines: ${xml.split(/\r\n|\n|\r/).length}`);
console.log(`Revisions: ${revisions.length}`);
const sizeKb = Buffer.byteLength(xml) / 1024;
console.log(`Filesize: ${sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(2)} Mb` : `${sizeKb.toFixed(2)} kb`}`);

if (sliceCount === undefined && maxSizeOption === undefined) process.exit(0);
if (!revisions.length) fail('cannot create slices because the XML contains no revisions');
if (firstRevision === -1 || lastRevisionEnd === -1) fail('could not identify the revision boundaries');

const prefix = xml.slice(0, firstRevision);
const suffix = xml.slice(lastRevisionEnd);
const revisionSizes = revisions.map((revision) => Buffer.byteLength(revision));
const totalRevisionBytes = revisionSizes.reduce((total, size) => total + size, 0);
if (maxSizeMb !== undefined) {
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const requiredSliceCount = Math.ceil(totalRevisionBytes / maxSizeBytes);
    sliceCount = sliceCount === undefined
        ? requiredSliceCount
        : Math.max(sliceCount, requiredSliceCount);
}
sliceCount = Math.min(sliceCount, revisions.length);
const sourceAbsolutePath = path.resolve(sourcePath);
const outputDirectory = path.join(path.dirname(sourceAbsolutePath), '..', 'slices');
const sourceBaseName = path.basename(sourcePath, path.extname(sourcePath));
fs.mkdirSync(outputDirectory, { recursive: true });

let revisionIndex = 0;
const targetBytes = totalRevisionBytes / sliceCount;

for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex += 1) {
    const remainingSlices = sliceCount - sliceIndex;
    const minimumRemainingRevisions = remainingSlices - 1;
    const sliceRevisions = [];
    let sliceBytes = 0;

    while (revisionIndex < revisions.length - minimumRemainingRevisions) {
        const nextRevisionBytes = revisionSizes[revisionIndex];
        const beforeDistance = Math.abs(targetBytes - sliceBytes);
        const afterDistance = Math.abs(targetBytes - (sliceBytes + nextRevisionBytes));

        if (sliceRevisions.length > 0 && afterDistance > beforeDistance) break;

        sliceRevisions.push(revisions[revisionIndex]);
        sliceBytes += nextRevisionBytes;
        revisionIndex += 1;
    }

    const output = prefix + sliceRevisions.join('') + suffix;
    const outputPath = path.join(outputDirectory, `${sourceBaseName}-${sliceIndex + 1}.xml`);
    validateXml(output, outputPath);
    fs.writeFileSync(outputPath, output);
    const outputSizeMb = Buffer.byteLength(output) / (1024 * 1024);
    console.log(`Created: ${path.relative(process.cwd(), outputPath)} (${sliceRevisions.length} revisions, ${outputSizeMb.toFixed(2)} Mb, valid XML)`);
}