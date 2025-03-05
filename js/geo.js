//import * as Turf from "@turf/turf";

import { polygon, point } from "@turf/helpers";
//import { booleanWithin } from "@turf/boolean-within";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";

const slash = '/';
const underscore = '_';

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

/*
var p = polygon(
	[
		[
			[-5, 52],
			[-4, 56],
			[-2, 51],
			[-7, 54],
			[-5, 52],
		],
	],
	{ name: "poly1" },
);

var pt = point([-2, 57]);

const inside = booleanPointInPolygon(pt, p); */
//console.log('inside: ', inside)



//import { polygon } from "@turf/helpers";

//import { point, greatCircle } from "https://unpkg.com/@turf/turf?module";
//import turf from '@turf/turf';


//console.log(greatCircle([0, 0], [100, 10]));
//console.log(point([100, 0]));
//const result = turf.pointToLineDistance(...);



import { readFileSync, writeFileSync } from 'fs';

// read city boundary
const landBoundaryJson = JSON.parse(readFileSync('./data/cityboundary/Land_Boundary.geojson', 'utf8'));
const cityBoundaryFeature = landBoundaryJson.features[0];  // geojson feature

var cityPoly = polygon(cityBoundaryFeature.geometry.coordinates);

function inBerkeley(gps) {
	//	var pt = point([-2,57]);

	//const inside = booleanPointInPolygon(pt, p);
	var pt = point([gps.lon, gps.lat]);
	const inside = booleanPointInPolygon(pt, cityPoly);
	return inside;

	//console.log('inside: ', inside)

}

//inBerkeley({ lat: 37.90944, lon: -122.31672 }) // false
//inBerkeley({ lat: 37.87605, lon: -122.28037 }) // true

/*
data/ways.json is ways exported from open street map

include I80
wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'

include service roads like South Road on campus

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|service)$"]->.streets;.streets out geom;'

wget -O ways.json 'https://www.overpass-api.de/api/interpreter?data=[out:json][timeout:25][bbox:37.83975,-122.32538,37.91495,-122.21329];way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]->.streets;.streets out geom;'
*/

var wayJson = JSON.parse(readFileSync('./data/ways.json', 'utf8'));
var wayData = [];

const mapNodeIdToGps = new Map();
//258761343
// make up fake names for traffic circles which include all the names of ways that connect to it
const mapNodeIdToNames = new Map();
//const mapNodeIdToWays = new Map(); // from nodeid to a set of way ids, used to figure out if 2 interscetion nodeIds are a way together


function onSameWay(ways, n1, n2, strSet) {

	for (const w of ways) {
		const nodeArray = w.nodes;

		if (nodeArray.includes(n1) && nodeArray.includes(n2) && strSet.has( w.name)) {
			console.log("way ", w.name, " include nodes ", n1, ' ', n2);
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
	const strSet = mapNodeidToStreetEnds.get (deadEndNode);

	for (const n of nodeArray) {
		if (onSameWay(wayData, n.nodeId, deadEndNode, strSet)) {
			return n;
		}
	}
	return undefined;
}

function initWayData(obj) {
	// loop through all the named ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}
		const name = tags.name;
		if (!name) {
			//console.log("Undefined name for way id:", way.id, ' ', way.geometry[0]);
			continue;
		}
		const geometry = way.geometry; // list of lat long 

		const nodes = way.nodes; // list of node ids

		for (let i = 0; i < nodes.length; i++) {
			mapNodeIdToGps.set(nodes[i], geometry[i])
			const n = mapNodeIdToNames.get(nodes[i]);
			if (n) {
				n.add(name);
			} else {

				mapNodeIdToNames.set(nodes[i], new Set([name]));
			}
		}

		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes });

		//console.log(name, geometry.length);
	}
	// loop through all the unnamed ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}


		if (tags.name) {
			continue;
		}
		//tags.name = "Fake"
		//const name = tags.name;

		const geometry = way.geometry; // list of lat long 

		const nodes = way.nodes; // list of node ids

		// make a list of motorway links, and name them from their adjacent motorways
		// ?????

		var fakeNames = new Set(['JUNCTION']); // not working for motorway_linnks
		const MOTORWAY_LINK = 'motorway_link';

		if (MOTORWAY_LINK == tags.highway ) {
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
		const name = sorted.join(slash);

		// later use the JUNCTION to identify nodes around a traffic circle and combine them

		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes });

		//console.log(name, geometry.length);
	}

}

initWayData(wayJson);

const mapNodeidToStreetEnds = new Map(); // maps nodeids to sets of street names which dead end on that node

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

function findDeadEnds(obj) {
	// loop through all the named ways
	for (const way of obj.elements) {
		const tags = way.tags;

		if (!tags) {
			//console.log("skipping no tag way");
			continue;
		}
		const name = tags.name;
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
				console.log("NodeId:", nodeid, " deadends ", n);
			}
		}

	}

}

findDeadEnds(wayJson);

function isDeadEnd(nodeid) {
	const retval = mapNodeidToStreetEnds.has(nodeid);
	return retval;
}

const metersPerDegree = 100000;

// approx dist in meters between two coords
function distGpsGps(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },
	const dLat = Math.abs(gps1.lat - gps2.lat);
	const dLon = Math.abs(gps1.lon - gps2.lon);
	const retval = metersPerDegree*(dLat + dLon);
	return retval;
}





const mapNodeidToName = new Map();
//const mapNodeidToNameArray = new Map();

function makeIntersectionString(s) {
	const sorted = Array.from(s).sort();;
	const retval = sorted.join(slash);
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
	const set = new Set(trimmed.split(slash))
	//  console.log( [...set].join(slash));

	const retval = Array.from(set).sort().join(slash);

	return retval;


	/*
		const names = raw.split(slash);
		const nameSet = new Set();
		for (var i =0; i< names.length;i++) {
			const trimmed = names[i].replace(regex, '');
			nameSet.add([trimmed]);
		}
	
		const sorted = Array.from(nameSet).sort();;
		const retval = sorted.join('/');
	 
		console.log(retval);*/

}

/*
obj = { intersections: [] }
{ coordinates: [gps.lat, gps.lon], raw: int, streets: clean(int) };
*/

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
function avgGps(iter) {
	console.log(iter.length);

	const n = iter.length;
	var latSum = 0, lonSum = 0;
	for (const i of iter) {
		latSum += i.coordinates[0];
		lonSum += i.coordinates[1];
	}
	const avg = { coordinates: [latSum / n, lonSum / n], raw: iter[0].raw, streets: iter[0].streets };

	return avg;
}

// averageJunctionDuplicates is used for coalescing roundabouts which start out as several intersections into one point
function averageJunctionDuplicates(obj) {
	const JUNCTION = 'JUNCTION';

	const simpleIntersections = obj.intersections.filter((elt) => !elt.streets.includes(JUNCTION));
	console.log('simple', simpleIntersections.length);

	const junctionIntersections = obj.intersections.filter((elt) => elt.streets.includes(JUNCTION)).sort((a, b) => strComp(a.streets, b.streets));
	console.log('junction', junctionIntersections.length);

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
const JUNCTION = 'JUNCTION';
function removeJUNCTIONS(obj) {
	const intersections = obj.intersections;
	const output = [];

	for (const int of intersections) {

		const streets = int.streets;
		var arrStreets = streets.split(slash).filter( (e) => !(e==JUNCTION))
		if (arrStreets.length > 1) {
			int.streets = arrStreets.join(slash);
			output.push(int);
		} else {
			console.log("Removing JUNCTION at ", int.streets, int);
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
	const retval = {lat: lat, lon: lon};
	return retval;
}

function distArrArr(a1, a2) {
	const g1 = arrayToGps(a1);
	const g2 = arrayToGps(a2);
	const retval = distGpsGps( g1, g2);
	return retval;
}
function averageBoulevardDuplicates(obj) {
	const intersections = obj.intersections;
	const mapStreetsToCount = new Map();
	// make a map of intersection streets to 0
	for (const int of intersections) {
		mapStreetsToCount.set(int.streets, 0);
	}
	// count up the number of intersections 
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
	for (const str of dupeStreetSet) {
		console.log("AVG", str);
		if (str.includes("Regal")) {
			console.log("stop here")
		}

		// get the matching intersections
		const matches = intersections.filter((elt) => elt.streets == str);

		// check for deadends
		var deadEndCount = 0;

		for (const m of matches) {
			if (isDeadEnd(m.nodeId)) {
				deadEndCount++;
				console.log("DeadEnd Node Id: ", m.nodeId, " for intersections ", str);
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
				if (distArrArr( matches[0].coordinates, matches[1].coordinates) < 50) {
					const avg = avgGps(matches);
					output.push(avg);
					continue;
				} else {
					// too far
					console.log("Not coalescing ", matches[0].streets);
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

// temp
/*
		for (const inter of matches) {
			output.push(inter);
		}
		continue; 

		*/


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





		//for (const inter of matches) {
			//	output.push(inter);
		//}




	}
	console.log(intersections.length)
	console.log(output.length);
	obj.intersections = output;




	/*
	const junction = 'JUNCTION';

	const simpleIntersections = obj.intersections.filter((elt) => !elt.streets.includes(junction));
	console.log('simple', simpleIntersections.length);

	const junctionIntersections = obj.intersections.filter((elt) => elt.streets.includes(junction)).sort((a, b) => strComp(a.streets, b.streets));
	console.log('junction', junctionIntersections.length);

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
	*/
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

function findintersections(ways) //  { "lat": 37.8655316, "lon": -122.3100479 },
{
	


	// make a map of node id to streets which contain that node
	for (const w of ways) {
		const name = w.name;
		const nodes = w.nodes;
		for (const n of nodes) {
			const s = mapNodeidToName.get(n);
			//const a = mapNodeidToNameArray.get(n);

			if (!s) {

				mapNodeidToName.set(n, new Set([name]));
			} else {
				s.add(name);
			}
			/*
			if (!a) {

				mapNodeidToNameArray.set(n, [name]);
			} else {
				a.push(name);
			}*/
		}
	}

	const setOfIntersections = new Map();  // streets to gps

	for (const [node, nameSet] of mapNodeidToName) {
		if (nameSet.size > 1) {
			//	console.log(node, nameSet);

			// offsets can mean there are 2 intersections of the same streets!!!
			// e.g. Dohr and Ashby (2)
			var intString = makeIntersectionString(nameSet);
			if (setOfIntersections.has(intString)) {
				for (var suffix = 2; suffix < 10; suffix++) {
					const suffixName = intString + underscore + suffix;
					if (!setOfIntersections.has(suffixName)) {
						intString = suffixName;
						break;
					}
				}
			}
			const gps = mapNodeIdToGps.get(node);
			const data = { lat: gps.lat, lon: gps.lon, nodeId: node };

			setOfIntersections.set(intString, data);
		}
	}

	var obj = { intersections: [] }
	for (const [int, data] of setOfIntersections) {

		if (inBerkeley({ lon: data.lon, lat: data.lat })) {
			//console.log(gps, int);
			const intersection = { coordinates: [data.lat, data.lon], raw: int, streets: clean(int), nodeId: data.nodeId };
			obj.intersections.push(intersection);

		} else {
			//console.log( "OUTSIDE BERKELEY", gps, int)
		}
	}

	// filter out identical named intersections with closeby gps coordiinates
	averageJunctionDuplicates(obj);

	// filter out identically named intersections at boulevard crossings
	averageBoulevardDuplicates(obj);

	// remove JUNCTIONS
	removeJUNCTIONS(obj);

	return obj;
}

const obj = findintersections(wayData);
var json = JSON.stringify(obj);

writeFileSync('./data/intersections.json', json);

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

function makeIntersectionGeoJson(intersections){

	const arrFeatures = [];
	for (const intersection of intersections) {
		const lat = intersection.coordinates[0];
		const lon = intersection.coordinates[1];

		const coords = [lon, lat]

		const streets = intersection.streets.split(slash);
		const properties = {'streets': streets};
		const feature = makePointFeature(coords,  properties);
		arrFeatures.push( feature);
	}

	const geoJson = makeFeatureSet(arrFeatures);
	return geoJson;
}

const geoJson = makeIntersectionGeoJson( obj.intersections);
writeFileSync('./data/intersections.geojson', JSON.stringify(geoJson, null, ' '));

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


