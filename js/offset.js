/*
IMPORTS 
*/
import * as turf from "@turf/turf";

import { classGpsbins } from "./gpsBins.js";
import { readFileSync, write, writeFileSync } from 'fs';

const DEBUG = false;
const ALGGEOM = 'Geom';

/* 
CONSTANTS
*/
const SLASH = '/';
const UNDERSCORE = '_';
const SEMICOLON = ';';
const JUNCTION = 'JUNCTION';
const MOTORWAY = 'motorway';
const MOTORWAY_LINK = 'motorway_link';
const UNINCORPORATED = 'Unincorporated'

const metersPerDegree = 100000;


function fix6(f) {
	const factor = 1000000.0;
	const retval = Math.round(f * factor) / factor
	return retval;
}

function fileNameIze(str) {
	return str.replaceAll(' ', '_').replaceAll('/', '_');
}

/*

  {
   "type": "Feature",
   "geometry": {
	"type": "Point",
	"coordinates": [
	 -119.801108,
	 38.689221
	]
   },
   "properties": {
	"streets": [
	 "Ox Bow",
	 "Pleasant Valley Road"
	],
	"nodeId": 86282180,
	"wayIds": [
	 10281768,
	 375625672
	],
	"cityName": "Markleeville"
   }
  },

*/

const countyWayFile = './input/ways_Alameda_County.json'
const countyWayJson = JSON.parse(readFileSync(countyWayFile, 'utf8'));

const mapWayIdToWay = new Map()
const mapNodeIdToWays = new Map()

for (const way of countyWayJson.elements) {
	mapWayIdToWay.set(way.id, way)


	if (!way.tags) {
		//console.log("skipping no tag way");
		continue;
	}
	const nodes = way.nodes; // list of node ids
	for (const node of nodes) {
		const n = mapNodeIdToWays.get(node);
		if (n) {
			n.add(way);
		} else {
			mapNodeIdToWays.set(node, new Set([way]));
		}
	}

}
function arrayFindIndex(arr, val) {
	const retval = arr.findIndex((e) => (e == val));
	return retval;
}
/* 
return a gps location on the way, meters from nodeId 
*/

// approx dist in meters between two coords

const METERSPERDEGREE = 100000;
function distGpsGpsCheesey(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },
	const dLat = Math.abs(gps1.lat - gps2.lat);
	const dLon = Math.abs(gps1.lon - gps2.lon);
	const retval = fix6(METERSPERDEGREE * (dLat + dLon));
	return retval;
}

// cheesy approximation
function distGpsGps(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },

	const tp2 = turf.point([gps2.lon, gps2.lat]);
	const tp1 = turf.point([gps1.lon, gps1.lat]);
	const options = { units: "meters" };
	const distance = fix6(turf.distance(tp1, tp2, options))
	//console.log('turf ', distance)
	//console.log('chzy ', distGpsGpsCheesey(gps1,gps2))

	return distance;
}

function interpolate(c1, c2, w2) {
	if (w2 < 0 || w2 > 1) {
		throw "unpexted weight ", w2
	}
	const w1 = 1.0 - w2;
	const c =
	{
		lat: fix6(w1 * c1.lat + w2 * c2.lat),
		lon: fix6(w1 * c1.lon + w2 * c2.lon)
	};
	return c;

}

function gmapUrl(c) {
	const url = `   ${c.lat},${c.lon}  `
	console.log(url)
	return url
}

function getNameOrRef( way) {
	const nameOrRef = way.tags.name ?? way.tags.ref;
	return nameOrRef
}

/* continue along the next identically named way for this highway 
*/
function findNextWay(way, wayId, nodeId) {
	const nameOrRef = getNameOrRef(way)

	const candidates = mapNodeIdToWays.get(nodeId)
	if (!candidates.has(way)) {
		throw "way unexpectedly not found"
	}
	const others = Array.from( candidates).filter( (w)=> (w!=way));

	//const rightName = others.filter( (w) => (w.tags.name == name))  // no name matches, maybe check ref also? TODO
	const rightName = others.filter( (w) => (getNameOrRef(w) == nameOrRef))  // no name matches, maybe check ref also? TODO
	if (rightName.length == 1) {
		const retval = rightName[0];
		return retval;
	}

	console.log("can't continue ", wayId , 'from ', nodeId)
	return null;

	//throw "can't continue ", wayId , 'from ', nodeId

}


function getOffsetGps(wayId, nodeId, meters) {
	const way = mapWayIdToWay.get(wayId);
	const nodeIndex = arrayFindIndex(way.nodes, nodeId);


	const geom = way.geometry;
	const nodes = way.nodes;
	const firstNode = nodes[0];
	const lastNode = nodes[nodes.length - 1];

	if (geom.length != nodes.length) {
		throw "mismatch coordindates and nodes for way ", wayId
	}

	//console.log("start node is ", geom[nodeIndex] )

	// compute distance for nodes
	const distances = [];
	let lastDist = 0.0;


	for (let i = 0; i < nodes.length - 1; i++) {
		distances[i] = distGpsGps(geom[i], geom[i + 1])
	}
	way.distances = distances;
	let distSoFar = 0;

	if (meters >= 0) {

		for (let i = nodeIndex; i < nodes.length - 1; i++) {
			// is meters in the next line segment?
			if (distances[i] + distSoFar >= meters) {
				// interpolate here
				const retval = interpolate(geom[i], geom[i + 1], (meters - distSoFar) / distances[i])
				return retval;
			} else {
				distSoFar += distances[i];
			}
		}
	} else {
		const posMeters = -meters; // let use positive numbers even tho going backwards....
		for (let i = nodeIndex - 1; i >= 0; i--) {
			// is meters in the next line segment?
			if (distances[i] + distSoFar >= posMeters) {
				// interpolate here
				const retval = interpolate(geom[i + 1], geom[i], (posMeters - distSoFar) / distances[i])
				return retval;
			} else {
				distSoFar += distances[i];
			}
		}

	}

	if (meters > 0) {
		const nextWay = findNextWay(way, wayId, lastNode);
		if (!nextWay) {
			return null;
		}
		const recurse = getOffsetGps( nextWay.id, lastNode, meters - distSoFar);

		return recurse;
	} else {
		const nextWay = findNextWay(way, wayId, firstNode);
		if (!nextWay) {
			return null;
		}
		const recurse = getOffsetGps( nextWay.id, firstNode, meters + distSoFar);
		return recurse;
	}

	throw "should be unreachable"

	
}
// 	markleeville oxbow const result = getOffsetGps(375625672, 86282180, -m);
// ca 89 wayid 269302859 nodeid 86282286  at laramie  const result = getOffsetGps(269302859, 86282286, -m);

// alameda county, adeline at bowl, wayId 202317699 nodeId 53082573
for (let m = 0; m < 500; m += 100) {

	const result = getOffsetGps(202317699, 53082573, -m);
	//const result = getOffsetGps(375625672, 86282180, m);
	console.log(" plus ", m, ' meters ', result)
	if (result) 	gmapUrl(result);
}
console.log('bye')
process.exit()

