// a node program
// read the addresses of Berkeley
// read the ways of Berkeley
// for each address, find the streets with the same name
// find the point on the ways of that street closest to the address
// spit it out as the gps location of the street in front of that address

//import { getJson } from "./utils_helper.js";
import { readFileSync } from 'fs';

import * as turf from "@turf/turf";

const DEBUG = false;
const ALGGEOM = 'Geom';

/* 
CONSTANTS
*/
const SLASH = '/';
const UNDERSCORE = '_';
const SEMICOLON = ';';

const metersPerDegree = 100000;

function fix6(f) {
	const factor = 1000000.0;
	const retval = Math.round(f * factor) / factor
	return retval;
}


//const countyWayFile = './input/ways_Alameda_County.json'
const countyWayFile = './test/input/ways_Berkeley.json'
const countyWayJson = JSON.parse(readFileSync(countyWayFile, 'utf8'));

const addressFile = "./berkeley_Addresses.json"
const addressJson = JSON.parse(readFileSync(addressFile, 'utf8'));

function getAddressGps(f) {
	/*
	  "type": "node",
  "id": 247365891,
  "lat": 37.8572860,
  "lon": -122.2529497,
  */

	if (f.type == "node") {
		const retval = [f.lon, f.lat];
		return retval
	}
	/*
  "type": "way",
  "id": 7805676,
  "bounds": {
	"minlat": 37.8652905,
	"minlon": -122.2579977,
	"maxlat": 37.8662351,
	"maxlon": -122.2562887
  },
	*/
	if (f.type == "way") {
		const b = f.bounds;
		const retval = [(b.maxlon + b.minlon) / 2, (b.maxlat + b.minlat) / 2];
		return retval
	}
	if (f.type == "relation") {
		const b = f.bounds;
		const retval = [(b.maxlon + b.minlon) / 2, (b.maxlat + b.minlat) / 2];
		return retval
	}
	throw "unexpected feature type"
}
function getAddressStreetName(f) {
	//"addr:street": "College Avenue",
	const retval = f.tags["addr:street"];
	return retval;
}

function getAddressHouseNumber(f) {
	//"addr:street": "College Avenue",
	const retval = f.tags["addr:housenumber"];
	return retval;
}

const testElement = addressJson.elements[0];
const testGps = getAddressGps(testElement);
const testStreetName = getAddressStreetName(testElement);

const waysForStreet = countyWayJson.elements.filter( (e) => (testStreetName == e.tags.name));
console.log(waysForStreet.length)

const METERSPERDEGREE = 100000;
function distGpsGpsCheesey(gps1, gps2) {//  { "lat": 37.8655316, "lon": -122.3100479 },
	const dLat = Math.abs(gps1.lat - gps2.lat);
	const dLon = Math.abs(gps1.lon - gps2.lon);
	const retval = fix6(METERSPERDEGREE * (dLat + dLon));
	return retval;
}


function distGpsToWay( gps, way) {
	// gps is [lon, lat]

	const arrGeom = way.geometry; // arr of [		{			"lat": 37.891877,			"lon": -122.3088681		},
	const coord = {"lat": gps[1], "lon": gps[0]};
	const arrDistances = arrGeom.map( (g) => distGpsGpsCheesey( coord, g))
	const dist = Math.min(...arrDistances);
	return dist;
}

function objToCoords( x) {
	return [x.lon, x.lat];
}
function distGpsToWayTurf(gps, way) {
	const pt = turf.point( gps);
	const line = turf.lineString( way.geometry.map( (o)=>objToCoords(o)));
	const dist = turf.pointToLineDistance(pt, line, { units: "meters" });


	const snapped = turf.nearestPointOnLine(line, pt, { units: "meters" });
	//console.log( snapped.properties.dist, snapped.geometry.coordinates)
	return [snapped.properties.dist, snapped.geometry.coordinates]


	//return dist

	

/*
[lon, lat]
var pt = turf.point([0, 0]);
var line = turf.lineString([
  [1, 1],
  [-1, 1],
]);

var distance = turf.pointToLineDistance(pt, line, { units: "miles" });
//=69.11854715938406

*/


}
console.log(distGpsToWay( testGps, waysForStreet[0]));
console.log(distGpsToWayTurf( testGps, waysForStreet[0]));
console.log(testGps)
console.log(testStreetName)

for (const w of waysForStreet) {
	console.log(distGpsToWayTurf( testGps, w));
}

const arrSnaps = waysForStreet.map( (w) => distGpsToWayTurf(testGps, w));

const minDist = Math.min( ... arrSnaps.map( (x) => x[0]));

const closest = arrSnaps.filter( (x) => (minDist == x[0]));
console.log( closest[0][1])



function findPointInStreetForAddress(element) {
	const testGps = getAddressGps(element);
    const testStreetName = getAddressStreetName(element);
	const testHouseNumber = getAddressHouseNumber(element);

    const waysForStreet = countyWayJson.elements.filter( (e) => (testStreetName == e.tags.name));

	if (waysForStreet.length == 0) {
		console.log( testStreetName, testHouseNumber, "NOT FOUND");
		return
	}

	const arrSnaps = waysForStreet.map( (w) => distGpsToWayTurf(testGps, w));

	const minDist = Math.min( ... arrSnaps.map( (x) => x[0]));

	const closest = arrSnaps.filter( (x) => (minDist == x[0]));
	const coords = closest[0][1];
	
	const googleCoords = [coords[1], coords[0]].map((f) => fix6(f))
	console.log( testStreetName, testHouseNumber, googleCoords);

}

for (const a of addressJson.elements) {
	findPointInStreetForAddress(a)
}
