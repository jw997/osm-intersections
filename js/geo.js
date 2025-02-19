//import * as Turf from "@turf/turf";

import { polygon, point } from "@turf/helpers";
import { booleanWithin } from "@turf/boolean-within";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";


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

const inside = booleanPointInPolygon(pt, p);
//console.log('inside: ', inside)



//import { polygon } from "@turf/helpers";

//import { point, greatCircle } from "https://unpkg.com/@turf/turf?module";
//import turf from '@turf/turf';


//console.log(greatCircle([0, 0], [100, 10]));
//console.log(point([100, 0]));
//const result = turf.pointToLineDistance(...);



import { readFileSync, writeFileSync } from 'fs';

//const Fs = require('fs');
//const Turf = require('turf');


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

inBerkeley({ lat: 37.90944, lon: -122.31672 }) // false
inBerkeley({ lat: 37.87605, lon: -122.28037 }) // true




/*
data/ways.json is ways exported from open street map

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
			console.log("Undefined name for way id:", way.id, ' ', way.geometry[0]);
			continue;
		}
		const geometry = way.geometry; // list of lat long 

		const nodes = way.nodes; // list of node ids

		for (var i = 0; i < nodes.length; i++) {
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

		var fakeNames = new Set();
		for (var i = 0; i < nodes.length; i++) {
			mapNodeIdToGps.set(nodes[i], geometry[i])
			const n = mapNodeIdToNames.get(nodes[i]);
			if (n) {
				fakeNames = fakeNames.union(n);
			}
		}

		const sorted = Array.from(fakeNames).sort();;
		const name = sorted.join('/');





		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes });

		//console.log(name, geometry.length);
	}

}

initWayData(wayJson);

function distGpsGps(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },
	const dLat = Math.abs(gps1.lat - gps2.lat);
	const dLon = Math.abs(gps1.lon - gps2.lon);
	const retval = dLat + dLon;
	return retval;
}
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

const mapNodeidToName = new Map();

function makeIntersectionString(s) {



	const sorted = Array.from(s).sort();;
	const retval = sorted.join('/');
	return retval;

}
function findintersections(ways) //  { "lat": 37.8655316, "lon": -122.3100479 },
{
	var min1 = 99999999999;  // min1 is closest node, min2 is 2nd closest
	// min2Name is always a different road name from min1Name
	var min1Name;
	var min2 = min1;
	var min2Name;

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
			//	console.log(node, nameSet);

			// offsets can mean there are 2 intersections of the same streets!!!
			// e.g. Dohr and Ashby (2)
			var intString = makeIntersectionString(nameSet);
			if (setOfIntersections.has(intString)) {
				for (var suffix = 2; suffix < 10; suffix++) {
					const suffixName = intString + '_' + suffix;
					if (!setOfIntersections.has(suffixName)) {
						intString = suffixName;
						break;
					} 
				}
			}

			setOfIntersections.set(intString, mapNodeIdToGps.get(node));
		}
	}

	var obj = { intersections: [] }
	for (const [int, gps] of setOfIntersections) {

		if (inBerkeley(gps)) {
			//console.log(gps, int);
			const intersection = { coordinates: [gps.lat, gps.lon], streets: int };
			obj.intersections.push(intersection);

		} else {
			//console.log( "OUTSIDE BERKELEY", gps, int)
		}
	}

	return obj;
}

const obj = findintersections(wayData);
var json = JSON.stringify(obj);

writeFileSync('./data/intersections.json', json);



/*
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


