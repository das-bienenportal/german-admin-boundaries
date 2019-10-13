'use strict';

const fs = require('fs');
const xmlstream = require('xml-object-stream');

const readStream = fs.createReadStream('germany2.osm');
const parser = xmlstream.parse(readStream);

const nodesOut = fs.createWriteStream('nodes.json');
const waysOut = fs.createWriteStream('ways.json');
const relationsOut = fs.createWriteStream('relations.json');

// <node
parser.each('node', async (node) => {
    const data = {
        _key: node.$.id,

        lat: Number(node.$.lat),
        lng: Number(node.$.lon)
    };

    if (node.$children) {
        data.tags = node.$children.map(n => ({ k: n.$.k, v: n.$.v }));

        const nonTags = node.$children.filter(n => 'tag' != n.$name);

        if (nonTags.length) {
            console.log(nonTags);
            console.log(JSON.stringify(node, false, 4));
        }
    }

    nodesOut.write(JSON.stringify(data));
    nodesOut.write('\n');
});

// <way
parser.each('way', async (way) => {
    const data = {
        _key: way.$.id,

        tags: way.$children.filter(n => n.$name === 'tag').map(n => n.$),
        nodes: way.$children.filter(n => n.$name === 'nd').map(n => n.$.ref)
    };

    const other = way.$children.filter(n => (n.$name !== 'tag') && (n.$name !== 'nd'));

    if (other.length) {
        console.log(way);
        console.log(other);
    }

    waysOut.write(JSON.stringify(data));
    waysOut.write('\n');
});

// <relation
parser.each('relation', async (relation) => {
    const data = {
        _key: relation.$.id,

        ways: relation.$children.filter(n => n.$.type === 'way').map(n => ({ ref: n.$.ref, role: n.$.role })),
        nodes: relation.$children.filter(n => n.$.type === 'node').map(n => n.$),
        tags: relation.$children.filter(n => n.$name === 'tag').map(n => n.$)
    };

    try {
        data.admin_level = Number(data.tags.find(n => n.k === 'admin_level').v);
    } catch (e) {
        console.log(`No admin_level for ${data._key}`);
        console.log(data.tags);
    }

    const subareas = relation.$children.filter(n => n.$.type === 'subarea').map(n => n.$.ref);

    if (subareas.length) {
        data.subareas = subareas;
    }

    const others = relation.$children.filter(n => {
        if (n.$name === 'member') {
            if ((n.$.type !== 'way') && (n.$.type !== 'node') && (n.$.type !== 'relation')) {
                return true;
            }

            return false;
        }

        if (n.$name !== 'tag') {
            return true;
        }

        return false;
    });

    if (others.length) {
        console.log(JSON.stringify(relation, false, 4));
        console.log(others);
        process.exit();
    }

    relationsOut.write(JSON.stringify(data));
    relationsOut.write('\n');
});

parser.on('error', (err) => {
    console.log(err);
});

parser.on('end', () => {
    nodesOut.end();
    waysOut.end();
    relationsOut.end();
});
