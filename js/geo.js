/*
IMPORTS 
*/
import * as turf from "@turf/turf";

import { classGpsbins } from "./gpsBins.js";
import { readFileSync, writeFileSync } from 'fs';
import { features } from "process";

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

const metersPerDegree = 100000;


// commmand line args
const inputFile = process.argv[2]
const outputFile = process.argv[3]

console.log("input:", inputFile, "output:", outputFile)

const countyCityFile = './data/county_cities.json';  // names of counties, and their cities
var countyCityJson = JSON.parse(readFileSync(countyCityFile, 'utf8'));

const countyCityBoundaryFile = './data/CaliforniaCountiesAndCitiesMini.geojson'; // borders 
var countyCityBoundaryJson = JSON.parse(readFileSync(countyCityBoundaryFile, 'utf8'));


const mapCountyToCities = new Map();
for (const obj of countyCityJson) {
	mapCountyToCities.set(obj.countyName, obj.cityNames);
}

var countyName;
var countyFeature;
const mapNameToBoundaryFeature = new Map(); 

function findCityFromCoords(coords) {
	
	const testPoint = turf.point(coords); // ?

	for (const [cityName,boundaryFeature] of mapNameToBoundaryFeature ) {
		if (turf.booleanPointInPolygon(testPoint, boundaryFeature)) {
			return cityName;
		}
	}
	return; // not in any city boundary
}
function loadBorders(wayJson) {
	// figure out county that contains coord and return a map from city names to turf features for each border

	const coordObj = wayJson.elements[0].geometry[0];
	const testCoords = [coordObj.lon, coordObj.lat];
	const testPoint = turf.point([coordObj.lon, coordObj.lat]);

	// find the county
	for (const feature of countyCityBoundaryJson.features) {
		const name = feature.properties.name;
		if (mapCountyToCities.has(name)) { // is this a countyname ?
			const testFeature = turf.feature(feature.geometry);
			//console.log("testing ", name)
			if (turf.booleanPointInPolygon(testPoint, testFeature)) {
				countyName = name;
				countyFeature = testFeature;
				break;
			} else {
				if (DEBUG) {
					console.log("point not in ", name)
				}
			}
		}
	}

	if (!countyName) {
		throw ("County not found!")
	}
	console.log("County", countyName)

	const arrExpectedCities = mapCountyToCities.get(countyName)
	const setExpectedCities = new Set(arrExpectedCities);

	// find the cities
	for (const feature of countyCityBoundaryJson.features) {
		const name = feature.properties.name;
		if (setExpectedCities.has(name)) { // is this a countyname ?

			if (mapNameToBoundaryFeature.has(name)) {
				console.log( "Already found boudnary for ", name)  // san francisco?
			}
			const cityFeature = turf.feature(feature.geometry);
			mapNameToBoundaryFeature.set(name, cityFeature);
		}
	}
	return ;
}
/* 
Function to generate geojson
*/


var lastTime = 0;
function getMS(msg) {
	const thisTime = Date.now();
	const diff = thisTime - lastTime;
	lastTime = thisTime;

	if (msg) {
		console.log(msg, ':', diff, ' ms')
	}
	return diff;
}
function LLtoArray(arrOfLL) {
	const retval = []
	for (const obj of arrOfLL) {
		const pair = [obj.lon, obj.lat];
		retval.push(pair)
	}
	return retval;
}


function makePointFeature(arrCoordLonLat, mapProperties) {
	const feature = {
		"type": "Feature",
		"geometry": {
			"type": "Point",
			"coordinates": arrCoordLonLat
		},
		"properties": mapProperties
	};

	return feature;
}

function makeFeatureSet(arrFeatures) {
	const featureSet = {
		"type": "FeatureCollection",
		"features": arrFeatures
	};
	return featureSet;
}

function getWayName(tags) {
	const arrNames = [];
	if (tags.name) {
		arrNames.push(tags.name)
	}
	if (tags.ref) {
		const refs = tags.ref.split(SEMICOLON);
		for (const r of refs) {
			arrNames.push(r)
		}
	}

	//const retval = tags.name ?? refname;
	const retval = arrNames.join(SEMICOLON)
	return retval;
}

function getCommonNodeId(way1, way2) {

	const setNodes1 = new Set(way1.nodes);

	const setNodes2 = new Set(way2.nodes);

	const inter = setNodes1.intersection(setNodes2)

	if (inter.size > 0) {
		return Array.from(inter)
	}
	return [];
}
function getIntersection(way1, way2) {

	const c1 = LLtoArray(way1.geometry);
	const c2 = LLtoArray(way2.geometry);

	const f1 = turf.lineString(c1)
	const f2 = turf.lineString(c2)

	const int = turf.lineIntersect(f1, f2)

	if (int.features.length == 0) {
		return null
	}
	return int.features[0].geometry.coordinates;
}

function checkHighwayTypes(arrTypes, bHasCommonNode) {
	// takes an array of length 2 and returns true/false

	const motorwayLinkTypes = arrTypes.filter((t) => (t == MOTORWAY_LINK));
	const motorwayTypes = arrTypes.filter((t) => (t == MOTORWAY));

	// allow motorway motorway bridge, where there is no node in common
	if (motorwayTypes.length == 2) {
		return !bHasCommonNode;  // ok if one flies over the other
	}

	if ((motorwayLinkTypes.length > 0) && (motorwayTypes.length > 0)) {
		return false;
	}

	return true;


}

// motor way and bridge intersections have no node in common 
function predicateOverpass(way) {
	if (way.highway == MOTORWAY) {
		return true;
	}

	if (way.bridge) {
		return true;
	}
	return false;
}
function findIntersectionsGeomtric(ways) {

	/* put all ways in search structure */
	getMS();
	const bins = new classGpsbins();

	for (const w of ways) {

		bins.addWay(w);

	}
	getMS('Add ways to bins');
	bins.stats();

	var obj = { intersections: [] }
	for (const way1 of ways) {

		if (!predicateOverpass(way1)) {
			continue;
		}
		const iter = bins.makePredicateIterator(way1, predicateOverpass);

		for (const way2 of iter) {  // >2 way intersections could appear multiple times
			if (way1 === way2) {
				continue;
			}

			if (!way1.name) {
				continue;
			}
			if (!way2.name) {
				continue;
			}

			// check different names for freeway to freeeway name change intersections TODO
			const intCoords = getIntersection(way1, way2);
			if (intCoords) {

				const arrCommonNodes = getCommonNodeId(way1, way2);
				const bHasCommonNode = (arrCommonNodes.length > 0)

				if (!checkHighwayTypes([way1.highway, way2.highway], bHasCommonNode)) {
					continue;
				}


				// found intersection
				const int = way1.name + SLASH + way2.name;
				if (DEBUG) {
					console.log(int, intCoords)
				}
				const intNodeId = bHasCommonNode ? arrCommonNodes[0] : ALGGEOM;
				const arrWayIds = [way1.way.id, way2.way.id];
				const intersection = { coordinates: [intCoords[1], intCoords[0]], raw: int, streets: clean(int), wayIds: arrWayIds, nodeId: intNodeId };
				obj.intersections.push(intersection)
			}

		}
	}




	//	debugStreet("Buchanan",obj.intersections);

	// filter out identical named intersections with closeby gps coordiinates
	getMS('findIntersectionLoops')
	//	averageJunctionDuplicates(obj);
	//	getMS('averageJunctionDuplicates')
	//	debugStreet("Buchanan",obj.intersections);
	// filter out identically named intersections at boulevard crossings
	//	averageNearbyBoulevardDuplicates(obj);
	//	getMS('averageNearbyBoulevardDuplicates')
	//	debugStreet("Buchanan",obj.intersections);
	// remove JUNCTIONS
	removeJUNCTIONS(obj);
	getMS('removeJUNCTIONS')
	//debugStreet("Buchanan",obj.intersections);
	return obj;


}



/*

Read ways data downloaded from open street map

data/ways.json is ways exported from open street map

include I80
wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'

include service roads like South Road on campus

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|service)$"]->.streets;.streets out geom;'

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'
*/



const mapNodeIdToWays = new Map();

const mapNodeIdToGps = new Map();

const mapNodeIdToNames = new Map();



function onSameWay(ways, n1, n2, strSet) {

	for (const w of ways) {
		const nodeArray = w.nodes;

		if (nodeArray.includes(n1) && nodeArray.includes(n2) && strSet.has(w.name)) {
			if (DEBUG) {
				console.log("way ", w.name, " include nodes ", n1, ' ', n2);
			}
			return true;
		}
	}
	return false;
}

// nodeArray is an array of nodeIds of the same intersection names, 
// deadEndNode is a nodeId which is a deadEnd
// find another node which is not a deadEnd and is on the same way as deadEndNode
function findNeighbor(nodeArray, deadEndNode) {
	// what street is deadEndNode a dead end of?
	const strSet = mapNodeidToStreetEnds.get(deadEndNode);

	for (const n of nodeArray) {
		if (onSameWay(wayData, n.nodeId, deadEndNode, strSet)) {
			return n;
		}
	}
	return undefined;
}

/* 
returns wayData array
*/
function initWayData(obj) {

	for (const way of obj.elements) {
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

	//const mapNodeIdToNames = new Map(); // populated by initWayData global
	var wayData = [];
	// loop through all the named ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}
		//var name = tags.name;
		const name = getWayName(tags)
		if (!name) {
			//console.log("Undefined name for way id:", way.id, ' ', way.geometry[0]);
			continue;
		}
		const geometry = way.geometry; // list of lat long 
		const nodes = way.nodes; // list of node ids

		// make a map of nodeid to all the names of roads it is part of
		for (let i = 0; i < nodes.length; i++) {
			mapNodeIdToGps.set(nodes[i], geometry[i])
			const n = mapNodeIdToNames.get(nodes[i]);
			if (n) {
				n.add(name);
			} else {
				mapNodeIdToNames.set(nodes[i], new Set([name]));
			}
		}
		//wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes });
		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, 'highway': tags.highway, 'way': way });
	}

	// loop through ways. for motorway_link, try to pick the name from the starting  (or ending) node that 
	// joins it to a named motorway
	const setMotorwayLinks = new Set();

	for (const way of obj.elements) {
		const tags = way.tags;

		if (tags.highway == MOTORWAY_LINK && !tags.name) {

			setMotorwayLinks.add(way);
		}
	}

	while (setMotorwayLinks.size > 0) {

		const startSize = setMotorwayLinks.size;

		/*  name from attached motorway */

		for (const way of setMotorwayLinks) {
			const geometry = way.geometry; // list of lat long 
			const nodes = way.nodes; // list of node ids
			const tags = way.tags
			// can get a name from nodes[0]?
			const firstNode = nodes[0]; const lastNode = nodes[nodes.length - 1];
			const lastNodeWays = mapNodeIdToWays.get(lastNode);
			const firstNodeWays = mapNodeIdToWays.get(firstNode);

			if (firstNodeWays) {
				// is there a way meeting the begginning of this motorway_link that either is a motorway or a motrowy_link with a name?
				let wayNamedFirst;
				let wayNamedLast;
				let wayNameFirst, wayNameLast

				for (const wayIntersecting of firstNodeWays) {
					const typeIntersecting = wayIntersecting.tags.highway;

					if ((typeIntersecting == MOTORWAY) && (wayIntersecting.tags.ref)) {
						wayNameFirst = wayIntersecting.tags.ref;
						break;
					}
					if ((typeIntersecting == MOTORWAY_LINK) && (wayIntersecting.tags.name)) {
						wayNameFirst = wayIntersecting.tags.name
						break;
					}
				}


				for (const wayIntersecting of lastNodeWays) {
					const typeIntersecting = wayIntersecting.tags.highway;

					if ((typeIntersecting == MOTORWAY) && (wayIntersecting.tags.ref)) {
						wayNameLast = wayIntersecting.tags.ref;
						break;
					}
					if ((typeIntersecting == MOTORWAY_LINK) && (wayIntersecting.tags.name)) {
						wayNameLast = wayIntersecting.tags.name
						break;
					}

				}

				const wayName = wayNameFirst ?? wayNameLast;

				// couldn't match this one, try another
				if (!wayName) {
					continue;
				}

				//const name = Array.from(firstNodeNames)[0];
				//const name = wayNamed.tags.name;
				const name = wayName;
				if (DEBUG) {
					console.log("naming motorway link ", name)
				}
				way.tags.name = name;

				setMotorwayLinks.delete(way)

				for (let i = 0; i < nodes.length; i++) {
					mapNodeIdToGps.set(nodes[i], geometry[i])
					const n = mapNodeIdToNames.get(nodes[i]);
					if (n) {
						n.add(name);
					} else {
						mapNodeIdToNames.set(nodes[i], new Set([name]));
					}
				}
				//wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, 'highway': tags.highway });
				wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, 'highway': tags.highway, 'way': way });
			}

		}


		const endSize = setMotorwayLinks.size;

		if (endSize == startSize) {
			// no progress, give up
			break;
		}
	}





	/* 
	traffic circles in Berkeley are modeled with unnamed ways 
	*/
	// loop through all the unnamed ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}
		if (getWayName(tags)) {
			//if (tags.name) {
			continue;
		}

		const geometry = way.geometry; // list of lat long 
		const nodes = way.nodes; // list of node ids

		// make a list of motorway links, and name them from their adjacent motorways
		// ?????

		let fakeNames = new Set(['JUNCTION']); // not working for motorway_linnks
		//const MOTORWAY_LINK = 'motorway_link';

		// on off ramps are also unnamed
		if (MOTORWAY_LINK == tags.highway) {
			fakeNames = new Set([MOTORWAY_LINK]);
		}
		for (let i = 0; i < nodes.length; i++) {
			mapNodeIdToGps.set(nodes[i], geometry[i])
			const n = mapNodeIdToNames.get(nodes[i]);
			if (n) {
				fakeNames = fakeNames.union(n);
			}
		}

		const sorted = Array.from(fakeNames).sort();;
		const name = sorted.join(SLASH);
		// later use the JUNCTION to identify nodes around a traffic circle and combine them
		//wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, highway: tags.highway });
		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, highway: tags.highway, 'way': way });
		//console.log(name, geometry.length);
	}
	return wayData;
}



function toggleValueSet(m, e, n) {
	if (!m.has(e)) {
		m.set(e, new Set([n]))
		return;
	}
	const s = m.get(e);
	if (s.has(n)) {
		s.delete(n);
	} else {
		s.add(n);
	}
}

/*
initialize mapNodeidToStreetEnds to find street deadend nodes
*/
function findDeadEnds(obj) {
	// loop through all the named ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}
		const name = getWayName(tags)
		//const name = tags.name;
		if (!name) {
			//	console.log("Undefined name for way id:", way.id, ' ', way.geometry[0]);
			continue;
		}

		const nodes = way.nodes; // array of node ids
		// only the first and last nodes could be dead ends
		if (nodes.length >= 2) {
			toggleValueSet(mapNodeidToStreetEnds, nodes.at(0), name);
			toggleValueSet(mapNodeidToStreetEnds, nodes.at(-1), name);
		}
	}

	for (const [nodeid, nameSet] of mapNodeidToStreetEnds) {
		if (nameSet.size == 0) {
			mapNodeidToStreetEnds.delete(nodeid);

		} else {
			for (const n of nameSet) {
				if (DEBUG) {
					console.log("NodeId:", nodeid, " deadends ", n);
				}
			}
		}
	}
}

function isDeadEnd(nodeid) {
	const retval = mapNodeidToStreetEnds.has(nodeid);
	return retval;
}



// approx dist in meters between two coords
function distGpsGps(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },
	const dLat = Math.abs(gps1.lat - gps2.lat);
	const dLon = Math.abs(gps1.lon - gps2.lon);
	const retval = metersPerDegree * (dLat + dLon);
	return retval;
}

function makeIntersectionString(s) {
	const sorted = Array.from(s).sort();;
	const retval = sorted.join(SLASH);
	return retval;
}

function clean(raw) {
	//console.log('raw',raw)
	// split raw on / 
	// remove _numbers
	// remove blanks and dupes
	// sort
	// reassemble with / 


	const regex = /_[0-9]/;
	const trimmed = raw.replace(regex, '');
	const set = new Set(trimmed.split(SLASH))
	//  console.log( [...set].join(slash));

	const retval = Array.from(set).sort().join(SLASH);

	return retval;
}


function strComp(nameA, nameB) {

	if (nameA < nameB) {
		return -1;
	}
	if (nameA > nameB) {
		return 1;
	}

	// names must be equal
	return 0;

}

/* 
compute the avg coordinate of some nodes
used to create a fake node at the center of a traffic circle
*/
function avgGps(iter) {
	if (DEBUG) {
		console.log(iter.length);
	}

	const n = iter.length;
	let latSum = 0, lonSum = 0;
	const setWayIds = new Set();
	for (const i of iter) {
		latSum += i.coordinates[0];
		lonSum += i.coordinates[1];
		for (const wayId of i.wayIds) {
			setWayIds.add(wayId)
		}
	}

	const arrWayids = Array.from(setWayIds)
	const avg = { coordinates: [latSum / n, lonSum / n], raw: iter[0].raw, streets: iter[0].streets, wayIds: arrWayids, nodeId: iter[0].nodeId };

	return avg;
}

/*
averageJunctionDuplicates is used for coalescing roundabouts which start out as several intersections into one point
updates obj.intersections
*/
function averageJunctionDuplicates(obj) {
	const JUNCTION = 'JUNCTION';

	const simpleIntersections = obj.intersections.filter((elt) => !elt.streets.includes(JUNCTION));
	if (DEBUG) {
		console.log('simple', simpleIntersections.length);
	}

	const junctionIntersections = obj.intersections.filter((elt) => elt.streets.includes(JUNCTION)).sort((a, b) => strComp(a.streets, b.streets));
	if (DEBUG) {
		console.log('junction', junctionIntersections.length);
	}
	// make a list of the unique streets
	const junctionSet = new Set();

	for (const int of junctionIntersections) {
		junctionSet.add(int.streets);
	}

	for (const str of junctionSet) {

		// get the matching intersections
		const matches = junctionIntersections.filter((elt) => elt.streets == str);

		const avg = avgGps(matches);
		simpleIntersections.push(avg);
	}
	obj.intersections = simpleIntersections;
}

function incrementMap(m, k) {
	const newVal = 1 + (m.get(k) ?? 0);
	m.set(k, newVal);
}


/*
remove fake street name JUNCTION
updates obj.intersections
*/
function removeJUNCTIONS(obj) {
	const intersections = obj.intersections;
	const output = [];

	for (const int of intersections) {

		const streets = int.streets;
		let arrStreets = streets.split(SLASH).filter((e) => !(e == JUNCTION))
		if (arrStreets.length > 1) {
			int.streets = arrStreets.join(SLASH);
			output.push(int);
		} else {
			if (DEBUG) {
				console.log("Removing JUNCTION at ", int.streets, int);
			}
		}

	}
	obj.intersections = output;
	return obj;

}
// averageBoulevardDuplicates is used for coalescing intersections at boulevard crossings
// this algorithm is wrong for offset intersections and loop side roads
//
// if a node is the end of street X where it crosses Y, only average it with other nodes on
// the same way of X 

function arrayToGps(arr) {
	const lat = arr[0];
	const lon = arr[1];
	const retval = { lat: lat, lon: lon };
	return retval;
}

function distArrArr(a1, a2) {
	const g1 = arrayToGps(a1);
	const g2 = arrayToGps(a2);
	const retval = distGpsGps(g1, g2);
	return retval;
}
/*
	When a street crosses a boulevard, you get an intersection on both sides
	average them
	updates obj.intersections

	TODO limit to short distances. i.e. 50 meters?
*/

function processCloseGroup(str, matches) {


	if (matches.length <= 1) {
		return matches;
	}

	const output = [];

	// figure out which ones are close by each other, and which are not
	// sort array by distance from first element
	// take the ones that are within 100 meters of the first one as a group
	// repeat


	// check for deadends
	let deadEndCount = 0;

	for (const m of matches) {
		if (isDeadEnd(m.nodeId)) {
			deadEndCount++;
			if (DEBUG) {
				console.log("DeadEnd Node Id: ", m.nodeId, " for intersections ", str);
			}
		}
	}

	// handle the "simple" case of several node intersections for the same street crossing
	if (0 == deadEndCount) {
		const avg = avgGps(matches);
		output.push(avg);
		return output
	}

	// 2 nodes 1 dead end is a street dead ending at a boulevard
	if (matches.length == 2) {
		if (deadEndCount == 1) {
			// fix Regal / Cragmont with a 50 meter width limit for boulevards????
			if (distArrArr(matches[0].coordinates, matches[1].coordinates) < 50) {
				const avg = avgGps(matches);
				output.push(avg);
				return output
			} else {
				// too far
				if (DEBUG) {
					console.log("Not coalescing ", matches[0].streets);
				}
				output.push(matches[0]);
				output.push(matches[1]);
				return output
			}
		}
		// 2 nodes 2 dead end is a street offset crossing another street
		if (deadEndCount == 2) {
			for (const inter of matches) {
				output.push(inter);
			}
			return output
		}
	}

	for (const m of matches) {
		if (isDeadEnd(m.nodeId)) {
			const other = findNeighbor(matches, m.nodeId);
			if (other) {
				const avg = avgGps([other, m]);
				output.push(avg);
				return output

			} else {
				output.push(m);
			}
		}
	}
	return output

}
function averageNearbyBoulevardDuplicates(obj) {
	const intersections = obj.intersections;
	const mapStreetsToCount = new Map();
	// make a map of intersection streets to 0
	for (const int of intersections) {
		mapStreetsToCount.set(int.streets, 0);
	}
	// count up the number of intersections with the same street names
	for (const int of intersections) {
		incrementMap(mapStreetsToCount, int.streets);
	}
	const output = [];
	const dupeStreetSet = new Set();
	// make a list of the intersections with dupes
	for (const int of intersections) {
		const ct = mapStreetsToCount.get(int.streets);

		if (ct == 1) {
			output.push(int);
		} else {
			dupeStreetSet.add(int.streets);
		}
	}

	// TODO filter out the sets the contain deadends

	// average the dupeStreets!
	for (const str of dupeStreetSet) {  // 9th & G in Yuba County Marysville & Beale AFB
		if (DEBUG) {
			console.log("AVG", str);
		}

		// get the matching intersections
		let matches = intersections.filter((elt) => elt.streets == str);

		while (matches.length > 0) {

			let base = matches[0].coordinates;
			matches.sort((a, b) => distArrArr(a.coordinates, base) - distArrArr(b.coordinates, base));
			const closeGroup = matches.filter((a) => (distArrArr(a.coordinates, base) < 50));

			if (matches.length > closeGroup.length) {
				if (DEBUG) {
					console.log("unrelated intersections with same street names", str, matches.length, matches[0].coordinates, matches[1].coordinates)
				}

			}

			const toPush = processCloseGroup(str, closeGroup);

			for (const i of toPush) {
				output.push(i)
			}

			matches = matches.slice(closeGroup.length);

		}

	}
	console.log(intersections.length)
	console.log(output.length);
	obj.intersections = output;

}


function averageBoulevardDuplicates(obj) {
	const intersections = obj.intersections;
	const mapStreetsToCount = new Map();
	// make a map of intersection streets to 0
	for (const int of intersections) {
		mapStreetsToCount.set(int.streets, 0);
	}
	// count up the number of intersections with the same street names
	for (const int of intersections) {
		incrementMap(mapStreetsToCount, int.streets);
	}
	const output = [];
	const dupeStreetSet = new Set();
	// make a list of the intersections with dupes
	for (const int of intersections) {
		const ct = mapStreetsToCount.get(int.streets);

		if (ct == 1) {
			output.push(int);
		} else {
			dupeStreetSet.add(int.streets);  // TODO only add if in same city or if close by???
		}
	}

	// TODO filter out the sets the contain deadends

	// average the dupeStreets!
	for (const str of dupeStreetSet) {  // 9th & G in Yuba County Marysville & Beale AFB
		if (DEBUG) {
			console.log("AVG", str);
		}

		// get the matching intersections
		const matches = intersections.filter((elt) => elt.streets == str);

		// check for deadends
		let deadEndCount = 0;

		for (const m of matches) {
			if (isDeadEnd(m.nodeId)) {
				deadEndCount++;
				if (DEBUG) {
					console.log("DeadEnd Node Id: ", m.nodeId, " for intersections ", str);
				}
			}
		}

		// handle the "simple" case of several node intersections for the same street crossing
		if (0 == deadEndCount) {
			const avg = avgGps(matches);
			output.push(avg);
			continue;
		}

		// 2 nodes 1 dead end is a street dead ending at a boulevard
		if (matches.length == 2) {
			if (deadEndCount == 1) {
				// fix Regal / Cragmont with a 50 meter width limit for boulevards????
				if (distArrArr(matches[0].coordinates, matches[1].coordinates) < 50) {
					const avg = avgGps(matches);
					output.push(avg);
					continue;
				} else {
					// too far
					if (DEBUG) {
						console.log("Not coalescing ", matches[0].streets);
					}
					output.push(matches[0]);
					output.push(matches[1]);
					continue;
				}
			}
			// 2 nodes 2 dead end is a street offset crossing another street
			if (deadEndCount == 2) {
				for (const inter of matches) {
					output.push(inter);
				}
				continue;
			}
		}

		for (const m of matches) {
			if (isDeadEnd(m.nodeId)) {
				const other = findNeighbor(matches, m.nodeId);
				if (other) {
					const avg = avgGps([other, m]);
					output.push(avg);
					continue;

				} else {
					output.push(m);
				}
			}
		}
	}
	console.log(intersections.length)
	console.log(output.length);
	obj.intersections = output;

}

/* 
find nodes with are part of 2 different ways that have names X and Y which are different  
that is an intersectino of X and Y

Implementation
loop through ways with names, loop thru their nodes, 
and make a map of nodeId to names of ways that touch that node id node mapNodeidToName

Loop through that map. nodes which have more than 1 name there are intersections

Note, there can be in real life, 2 intersections with the same name.  Examples, a loop road off a main road, 
or a road that crosses another, with an offset.

Note, where a single street meets a boulevard, you get 2 intersection points

Note, traffic circles are not usually named, and so we have generated a fake
name for them with JUNCTION and all the connecting streets names

Traffic circles have an intersection with each leg.  We replace those by one generated 
intersection which is their average.

Freeways are tagged as hightway motorway, and the on and off ramps are motorway_link



*/
// don't rreport those intersections thaat re along on and offramps
function notAllMotorwayLinks(nodeId) {

	const setWays = mapNodeIdToWays.get(nodeId);

	for (const way of setWays) {
		if (way.tags.highway != MOTORWAY_LINK) {
			return true
		}
	}
	return false;
}


function allMotorwayAndLinks(nodeId) {

	const setWays = mapNodeIdToWays.get(nodeId);

	for (const way of setWays) {
		const highwayType = way.tags.highway;

		if ((highwayType != MOTORWAY_LINK) && (highwayType != MOTORWAY)) {
			return false
		}
	}
	return true;
}


function debugStreet(street, intersections) {
	const interesting = intersections.filter((i) => (i.streets.includes(street)));
	for (const i of interesting) {
		console.log(i);
	}
}
function getWaysIdsForNode(nodeId) {
	const retval = Array.from(mapNodeIdToWays.get(nodeId)).map((w) => w.id);
	return retval;
}
function findintersections(ways) //  { "lat": 37.8655316, "lon": -122.3100479 },
{
	const mapNodeidToName = new Map(); // populated by findIntersections

	// make a map of node id to set of street names which contain that node
	for (const w of ways) {
		const name = w.name;
		const nodes = w.nodes;
		for (const n of nodes) {
			const s = mapNodeidToName.get(n);

			if (!s) {

				mapNodeidToName.set(n, new Set([name]));
			} else {
				s.add(name);
			}
		}
	}

	const setOfIntersections = new Map();  // streets to gps

	for (const [node, nameSet] of mapNodeidToName) {
		if (nameSet.size > 1) {

			// there are at least 2 streets, make sure they are not all motorway_links
			if (!notAllMotorwayLinks(node)) {
				continue;
			}

			// skip motorway name changes, and motorway exits
			if (allMotorwayAndLinks(node)) {
				continue;
			}
			//	console.log(node, nameSet);

			// offsets can mean there are 2 intersections of the same streets!!!
			// e.g. Dohr and Ashby (2)
			let intString = makeIntersectionString(nameSet);

			if (setOfIntersections.has(intString)) {
				for (let suffix = 2; suffix < 10; suffix++) {
					const suffixName = intString + UNDERSCORE + suffix;
					if (!setOfIntersections.has(suffixName)) {
						intString = suffixName;
						break;
					}
				}
			}
			const gps = mapNodeIdToGps.get(node);
			const data = { lat: gps.lat, lon: gps.lon, nodeId: node };

			setOfIntersections.set(intString, data);

			if (intString.includes("Buchanan")) {
				//	console.log("break ", intString)
			}
		}
	}

	var obj = { intersections: [] }
	for (const [int, data] of setOfIntersections) {

		if (true) {
			//console.log(gps, int);
			const arrWayIds = getWaysIdsForNode(data.nodeId);
			const intersection = { coordinates: [data.lat, data.lon], raw: int, streets: clean(int), wayIds: arrWayIds, nodeId: data.nodeId };
			obj.intersections.push(intersection);

		} else {
			//console.log( "OUTSIDE BERKELEY", gps, int)
		}
	}

	//	debugStreet("Buchanan",obj.intersections);

	// filter out identical named intersections with closeby gps coordiinates
	averageJunctionDuplicates(obj);

	//	debugStreet("Buchanan",obj.intersections);
	// filter out identically named intersections at boulevard crossings
	averageNearbyBoulevardDuplicates(obj);
	//	debugStreet("Buchanan",obj.intersections);
	// remove JUNCTIONS
	removeJUNCTIONS(obj);
	//debugStreet("Buchanan",obj.intersections);
	return obj;
}



/* obj is an array of 
 {
	  "coordinates": [
		37.8779186,
		-122.3077791
	  ],
	  "raw": "Gilman Street/West Frontage Road_2",
	  "streets": "Gilman Street/West Frontage Road",
	  "nodeId": 12449832925
	}

*/

function fix6(f) {
	const factor = 1000000.0;
	const retval = Math.round(f * factor) / factor
	return retval;
}

function makeIntersectionGeoJson(intersections) {

	const arrFeatures = [];
	for (const intersection of intersections) {
		const lat = fix6(intersection.coordinates[0]);
		const lon = fix6(intersection.coordinates[1]);

		const coords = [lon, lat]
		
		const cityName = findCityFromCoords(coords) ?? 'Unincorporated';  // double check in county??

		const wayIds = intersection.wayIds;
		const streets = intersection.streets.split(SLASH);
		const properties = { 'streets': streets, nodeId: intersection.nodeId, wayIds: wayIds, cityName:cityName };
		const feature = makePointFeature(coords, properties);
		arrFeatures.push(feature);
	}

	const geoJson = makeFeatureSet(arrFeatures);
	return geoJson;
}

/*
MAIN

read the ways.json
do some stuff
write the intersection geojson
*/


// make up fake names for traffic circles which include all the names of ways that connect to it
// map the nodeId to the set of street names of ways that touch it


//const mapNodeidToNameArray = new Map();

const mapNodeidToStreetEnds = new Map(); // maps nodeids to sets of street names which dead end on that node

var wayJson = JSON.parse(readFileSync(inputFile, 'utf8'));

loadBorders(wayJson);

var wayData = initWayData(wayJson);
findDeadEnds(wayJson);

const obj = findintersections(wayData);

const objGeometric = findIntersectionsGeomtric(wayData);

for (const inter of objGeometric.intersections) {
	obj.intersections.push(inter)
}

const geoJson = makeIntersectionGeoJson(obj.intersections);

writeFileSync(outputFile, JSON.stringify(geoJson, null, ' '));

/*
function distGpsGeometry(gps, geom) {  // geom is array of gps points
	var minDist = 9999999999;
	for (const gps2 of geom) {
		const d = distGpsGps(gps, gps2);
		minDist = Math.min(minDist, d);
	}
	return minDist;
}


// 1 degree approx 100,000 meteres
const metersPerDegree = 100000;
const fuzzLimit = 0.0001

function findClosest(gps, ways) //  { "lat": 37.8655316, "lon": -122.3100479 },
{
	var min1 = 99999999999;  // min1 is closest node, min2 is 2nd closest
	// min2Name is always a different road name from min1Name
	var min1Name;
	var min2 = min1;
	var min2Name;

	for (const w of ways) {
		const d = distGpsGeometry(gps, w.geometry);
		if (d < min1) {

			if (w.name != min1Name) { // avoid making min2Name equal to new min1Name
				min2Name = min1Name;
				min2 = min1;
			}


			min1Name = w.name;
			min1 = d;
			if (d < 10 * fuzzLimit) {
				//console.log(min1Name, ': ', metersPerDegree * d);
			}
			continue;
		}


		if (d < min2 && w.name != min1Name) { // avoid making min2Name equal to new min1Name
			min2Name = w.name;
			min2 = d;
			if (d < 10 * fuzzLimit) {
				//console.log(min2Name, ': ', metersPerDegree * d);
			}
		}

	}
	if (min2) {
		return "" + min1Name + '/' + min2Name;
	} else {
		return min1Name;
	}

}


// test point 37.86649761259358
// Longitude: -122.27820812735916
const tp1 = { "lat": 37.86649761259358, "lon": -122.27820812735916 };
console.log(findClosest(tp1, wayData));

const tp2 = { "lat": 37.86817029300005, "lon": -122.277171513 }; //Latitude: 37.86817029300005 Longitude: -122.277171513
console.log(findClosest(tp2, wayData));

const tp3 = { "lat": 37.8891174940534, "lon": -122.2832986980807 }; //Latitude: 37.8891174940534 Longitude: -122.2832986980807
console.log(findClosest(tp3, wayData));


const tp4 = { "lat": 37.89738664679591, "lon": -122.30111474391248 }; //Latitude: 37.89738664679591 Longitude: -122.30111474391248
console.log(findClosest(tp4, wayData));


// south of border
const tp5 = { "lat": 37.83714835788253, "lon": -122.26887620280867 }; // Latitude: 37.83714835788253 Longitude: -122.26887620280867
console.log(findClosest(tp5, wayData));

const tp6 = { "lat": 37.869567599018744, "lon": -122.31960105118446 }; //37.869567599018744 Longitude: -122.31960105118446
console.log(findClosest(tp6, wayData));

// Latitude: 37.88094309945162 Longitude: -122.24792946251237
const tp7 = { "lat": 37.88094309945162, "lon": -122.24792946251237 }; // 37.88094309945162 -122.24792946251237
console.log(findClosest(tp7, wayData));

// freewaye xit
const tp8 = { "lat": 37.88637794963968, "lon": -122.30839870791239 }; // -122.30839870791239
console.log(findClosest(tp8, wayData));

// oholone greenway near heast

const tp9 = { "lat": 37.87291108342455, "lon": -122.27735663669807 }; // Latitude: 37.87291108342455 Longitude: -122.27735663669807
console.log(findClosest(tp9, wayData));


///

const tp10 = { "lat": 37.87327648676752, "lon": -122.28340590706408 }; // 37.87327648676752 Longitude: -122.28340590706408
console.log(findClosest(tp10, wayData));

// hearst oxford 37.874145812370294 Longitude: -122.26629053003462

const tp11 = { "lat": 37.874145812370294, "lon": -122.26629053003462 }; // 37.87327648676752 Longitude: -122.28340590706408
console.log(findClosest(tp11, wayData));


const tp12 = { "lat": 37.85954819415937, "lon": -122.31603194372578 }; //Latitude: 37.85954819415937 Longitude: -122.31603194372578
console.log(findClosest(tp12, wayData));
console.log("bye")
*/


