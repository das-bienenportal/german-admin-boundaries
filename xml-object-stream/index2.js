'use strict';

const expat = require('node-expat');
const events = require('events');

module.exports.parse = ((readStream, options = {}) => {
    if (null == options.stripNamespaces) { options.stripNamespaces = true; }

    const parser = new expat.Parser('UTF-8');
    const emitter = new events.EventEmitter();

    readStream.on('data', data => {
        parser.parse(data.toString());
    });

    readStream.on('end', () => process.nextTick(() => emitter.emit('end')));
    readStream.on('error', (err) => emitter.emit('error', err));
    readStream.on('close', () => emitter.emit('close'));


    const each = (nodeName, eachNode) => {

        const eachNodeDelayed = (node) => process.nextTick(() => eachNode(node));

        let currentNode = null;

        parser.on('error', (err) => emitter.emit('error', err));

        parser.on('startElement', (name, attrs) => {
            if (options.stripNamespaces) {
                name = stripNamespace(name);
            }

            if (name === nodeName || currentNode) {
                currentNode = { $name: name, $: attrs, $parent: currentNode };
            }
        });

        parser.on('text', (text) => {
            if (null == currentNode)
                return;

            if (null == currentNode.$text)
                currentNode.$text = '';
            currentNode.$text += text;
        });


        parser.on('endElement', (name) => {
            if (null == currentNode)
                return;

            if (currentNode.$name === nodeName) {

                if (currentNode.$parent) {
                    throw new Error('Top-level node should not have a parent. Possible memory leak');
                }

                eachNodeDelayed(currentNode);
            }

            const parent = currentNode.$parent;
            if (null != parent) {
                delete currentNode.$parent;
                if (null == parent.$children)
                    parent.$children = [];

                parent.$children.push(currentNode);
                parent[currentNode.$name] = currentNode;
            }

            currentNode = parent;
        });
    }

    return {
        each,
        on: (e, cb) => emitter.on(e, cb),
        pause: () => readStream.pause(),
        resume: () => readStream.resume()
    };
});

const stripNamespace = (name) => name.replace(/^.*:/, '');
