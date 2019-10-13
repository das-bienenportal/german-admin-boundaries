'use strict';

const fastango3 = require('fastango3');
const db = fastango3('http://127.0.0.1:8529', 'osm');

const turf = require('@turf/turf');
const fs = require('fs');
const inspect = require('util').inspect;

const streamout = fs.createWriteStream('germany-admin-borders-feature-collection.geojson');
const features = fs.createWriteStream('germany-admin-borders-features.json');

streamout.write(`
{
"type": "FeatureCollection",
"features": [
`);

const run = async () => {
    let failed = 0;
    let doneRelations = 0;

    const relationKeys = await getRelationKeys();
    // const relationKeys = ["164723"];

    for (const relationKey of relationKeys) {
        console.log(`Relation ${relationKey}`);

        let [status, relation] = await getRelationDocument(relationKey);
        if (202 < status) {
            console.log(`FAILED for ${relationKey}`);
            failed++;
            continue;
        }

        const innerWays = relation.ways.filter(w => w.role === 'inner').map(w => w.nodes);
        const outerWays = relation.ways.filter(w => w.role === 'outer').map(w => w.nodes);
        console.log(`inner ways: ${innerWays.length}`);
        console.log(`outer ways: ${outerWays.length}`);

        const completeInnerWays = getCompleteWays(innerWays);
        const completeOuterWays = getCompleteWays(outerWays);

        console.log(`Complete inner ways ${completeInnerWays.length}`);
        console.log(`Complete outer ways ${completeOuterWays.length}`);

        const polygons = [];
        for (const outerWay of completeOuterWays) {
            const curPolygons = [outerWay];

            for (const innerWay of completeInnerWays) {
                console.log('check hole');

                try {
                    const innerInOuter = turf.booleanContains(
                        turf.polygon([outerWay]), turf.polygon([innerWay])
                    );

                    if (innerInOuter) { // is innerway in outer?
                        curPolygons.push(innerWay);
                        console.log('found hole');
                    }
                } catch (error) {
                    console.log(error.message);
                    console.log(inspect(outerWay));
                    console.log(inspect(innerWay));
                }
            } // for
            polygons.push(curPolygons);
        }

        const multipolygon = turf.multiPolygon(polygons, Object.assign({}, ...relation.tags.map(t => ({ [t.k]: t.v }))));

        multipolygon.properties.area = turf.area(multipolygon) / (1000 * 1000);

        streamout.write(JSON.stringify(multipolygon));
        features.write(JSON.stringify(multipolygon));
        features.write('\n');

        if (relationKey !== relationKeys.slice(-1)[0]) // write \n from 0 .. n-1
            streamout.write(`,\n`);

        [status] = await db.osmrelations.asyncUpdate(relation._key,
            JSON.stringify({ geojson: multipolygon })
        );
        if (202 < status) {
            console.log(status);
        } else {
            doneRelations++;
        }
    } // for

    streamout.write(`
    ]
    }
    `);

    console.log(`Failed ${failed}`);
    console.log(`Done relations ${doneRelations}`);
};

run();



//----


async function getRelationKeys() {
    const [status, relationKeys] = await db._asyncQ(`
    FOR r IN osmrelations RETURN r._key`, {}, { all: true });
    return relationKeys;
} // getRelationKeys()

async function getRelationDocument(relationKey) {
    const [status, [relation], extra] = await db._asyncQ(`
    LET relation = DOCUMENT(osmrelations, @relationKey)

    LET ways = (FOR wayRef IN relation.ways
        LET wayDoc = DOCUMENT(osmways, wayRef.ref)

        LET nodes = (FOR nodeRef IN wayDoc.nodes
            RETURN DOCUMENT(osmnodes, nodeRef)
        )
        
        LET finalWayDoc = MERGE(wayDoc, {nodes})

        RETURN MERGE(wayRef, {tags: finalWayDoc.tags, nodes: finalWayDoc.nodes})
    )

    RETURN MERGE(relation, {ways})
    `, { relationKey }, { all: true });
    if (202 < status) {
        console.log(extra);
    }
    return [status, relation];
} // getRelationDocument()

function getCompleteWays(ways) {
    const completeWays = [];
    if (0 === ways.length) {
        return completeWays;
    }

    const currentCompleteWay = ways.shift();

    while (true) {
        if (currentCompleteWay.length && currentCompleteWay[0]._key === currentCompleteWay.slice(-1)[0]._key) {
            completeWays.push(Array.from(currentCompleteWay));
            currentCompleteWay.length = 0;

            if (ways.length) {
                currentCompleteWay.push(...ways.shift());
            }

            continue;
        }

        if (0 === ways.length) {

            break;
        }

        const lastNodeKey = currentCompleteWay.slice(-1).pop()._key;

        const nodeList = ways.find(w => (w[0]._key === lastNodeKey) || (w.slice(-1)[0]._key === lastNodeKey));

        if (nodeList === undefined) { // not found
            currentCompleteWay.length = 0;
            if (ways.length) {
                currentCompleteWay.push(...ways.shift());
            }
        } else {
            // get index
            // remove
            // add to ways
            const idx = ways.indexOf(nodeList);
            ways.splice(idx, 1);
            if (nodeList[0]._key !== lastNodeKey) { // nodeList must be reverse, lastNodeKey must be first in new list
                nodeList.reverse();
            }

            currentCompleteWay.push(...nodeList.slice(1)); // first elemment matches last element
        }
    }

    return completeWays.map(way => way.map(node => [node.lng, node.lat]));
}
