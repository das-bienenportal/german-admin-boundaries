# german-admin-boundaries
administrative boundaries of germany; generation and extraction


### build requirements
node, osmctools, ArangoDB


### how to build
run `npm install`   
create database `osm`  
create collections `osmnodes, osmways, osmrelations`  

run `generate.sh`  

It will
* download the latest osm data from geofabrik
* convert pbf to osm
* extract relations with `boundary=administrative`
* import nodes, ways and relations into ArangoDB
* build GeoJSON features
