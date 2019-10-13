wget "https://download.geofabrik.de/europe/germany-latest.osm.pbf"
osmconvert germany-latest.osm.pbf -o=germany.osm
osmfilter germany.osm --keep= --keep-relations="boundary=administrative" -o=germany2.osm

# extract relations, ways, nodes from osm xml
node extract-from-xml.js

# import into arangodb
arangoimp --file relations.json --collection osmrelations --server.database osm --create-collection true --overwrite true
arangoimp --file ways.json --collection osmways --server.database osm --create-collection true --overwrite true
arangoimp --file nodes.json --collection osmnodes --server.database osm --create-collection true --overwrite true

# build GeoJSON
node convert_relations.js
