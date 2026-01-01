/*
IMPORTS 
*/
//import * as Turf from "@turf/turf";
import { polygon, point } from "@turf/helpers";
//import { booleanWithin } from "@turf/boolean-within";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { readFileSync, writeFileSync } from 'fs';

/* 
CONSTANTS
*/
const slash = '/';
const underscore = '_';
const JUNCTION = 'JUNCTION';
const metersPerDegree = 100000;


// commmand line args
const inputFile = process.argv[2]
const outputFile = process.argv[3]

console.log("input:", inputFile, "output:", outputFile)
/* 
Function to generate geojson
*/
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

	var refname
	if (tags.ref) {
		refname = tags.ref.split(';')[0];
	}
	const arrNames = [];
	if (tags.name) {
		arrNames.push(tags.name)
	}
	if (tags.ref) {
		const refs = tags.ref.split(';');
		for (const r of refs) {
			arrNames.push(r)
		}
	}
	/* didn;t fix all the freeway interchange problems
	if (tags.highway == "motorway_link") {
		const destRefStr  = tags['destination:ref'];
		const dest = tags.destination;

		if (destRefStr) {
			const refs =  destRefStr.split(';');
			for (const r of refs ) {
				arrNames.push(r)
			}
		} else { // no destionation:refs
			if (dest) {
				arrNames.push(dest) // is this a street or city??
			}
		}

	}*/
	//const retval = tags.name ?? refname;
	const retval = arrNames.join(';')
	return retval;
}

/*
Trim the intersection list to match the city
*/
function inBerkeley(gps) {
	var pt = point([gps.lon, gps.lat]);
	const inside = booleanPointInPolygon(pt, cityPoly);
	return inside;
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
		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes });
	}

	// loop through ways. for motorway_link, try to pick the name from the starting  (or ending) node that 
	// joins it to a named motorway
	const setMotorwayLinks = new Set();

	for (const way of obj.elements) {
		const tags = way.tags;

		if (tags.highway == 'motorway_link' && !tags.name) {

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

					if ((typeIntersecting == 'motorway') && (wayIntersecting.tags.ref)) {
						wayNameFirst = wayIntersecting.tags.ref;
						break;
					}
					if ((typeIntersecting == 'motorway_link') && (wayIntersecting.tags.name)) {
						wayNameFirst = wayIntersecting.tags.name
						break;
					}

					/*const nameIntersecting = wayIntersecting.tags.name;
					const typeIntersecting = wayIntersecting.tags.highway;

					if (nameIntersecting) {
						if (typeIntersecting == 'motorway' || typeIntersecting == 'motorway_link') {
							wayNamedFirst = wayIntersecting;
							break;
						}
					}*/
				}


				for (const wayIntersecting of lastNodeWays) {
					const typeIntersecting = wayIntersecting.tags.highway;

					if ((typeIntersecting == 'motorway') && (wayIntersecting.tags.ref)) {
						wayNameLast = wayIntersecting.tags.ref;
						break;
					}
					if ((typeIntersecting == 'motorway_link') && (wayIntersecting.tags.name)) {
						wayNameLast = wayIntersecting.tags.name
						break;
					}
					/*const nameIntersecting = wayIntersecting.tags.name;
					const typeIntersecting = wayIntersecting.tags.highway;

					if (nameIntersecting) {
						if (typeIntersecting == 'motorway' || typeIntersecting == 'motorway_link') {
							wayNamedLast = wayIntersecting;
							break;
						}
					}*/
				}

				const wayName = wayNameFirst ?? wayNameLast;

				// couldn't match this one, try another
				if (!wayName) {
					continue;
				}

				//const name = Array.from(firstNodeNames)[0];
				//const name = wayNamed.tags.name;
				const name = wayName;

				console.log("naming motorway link ", name)
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
				wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, 'highway': tags.highway });
			}

		}



		/*  name from first node 
				for (const way of setMotorwayLinks) {
					const geometry = way.geometry; // list of lat long 
					const nodes = way.nodes; // list of node ids
					const tags = way.tags
					// can get a name from nodes[0]?
					const firstNode = nodes[0]; const lastNode = nodes[nodes.length - 1];
					const firstNodeNames = mapNodeIdToNames.get(firstNode);
					if (firstNodeNames) {
						const name = Array.from(firstNodeNames)[0];
						console.log( "naming motorway link ", name)
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
						wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, 'highway': tags.highway });
					}
		
				}*/

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
		const MOTORWAY_LINK = 'motorway_link';

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
		const name = sorted.join(slash);
		// later use the JUNCTION to identify nodes around a traffic circle and combine them
		wayData.push({ 'name': name, 'geometry': geometry, 'nodes': nodes, highway: tags.highway });
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
				console.log("NodeId:", nodeid, " deadends ", n);
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
	console.log(iter.length);

	const n = iter.length;
	let latSum = 0, lonSum = 0;
	for (const i of iter) {
		latSum += i.coordinates[0];
		lonSum += i.coordinates[1];
	}
	const avg = { coordinates: [latSum / n, lonSum / n], raw: iter[0].raw, streets: iter[0].streets };

	return avg;
}

/*
averageJunctionDuplicates is used for coalescing roundabouts which start out as several intersections into one point
updates obj.intersections
*/
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


/*
remove fake street name JUNCTION
updates obj.intersections
*/
function removeJUNCTIONS(obj) {
	const intersections = obj.intersections;
	const output = [];

	for (const int of intersections) {

		const streets = int.streets;
		let arrStreets = streets.split(slash).filter((e) => !(e == JUNCTION))
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
			console.log("DeadEnd Node Id: ", m.nodeId, " for intersections ", str);
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
				console.log("Not coalescing ", matches[0].streets);
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
		console.log("AVG", str);

		if (str.includes("11th Street/G Stree")) {
			console.log("break");
		}

		// get the matching intersections
		let matches = intersections.filter((elt) => elt.streets == str);


		while (matches.length > 0) {

			let base = matches[0].coordinates;
			matches.sort((a, b) => distArrArr(a.coordinates, base) - distArrArr(b.coordinates, base));
			const closeGroup = matches.filter((a) => (distArrArr(a.coordinates, base) < 50));

			if (matches.length > closeGroup.length) {
				console.log("unrelated intersectiosn with same street names", str, matches.length, matches[0].coordinates, matches[1].coordinates)

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
		console.log("AVG", str);
		if (str.includes("Regal")) {
			console.log("stop here")
		}

		// get the matching intersections
		const matches = intersections.filter((elt) => elt.streets == str);

		// check for deadends
		let deadEndCount = 0;

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
				if (distArrArr(matches[0].coordinates, matches[1].coordinates) < 50) {
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
		if (way.tags.highway != 'motorway_link') {
			return true
		}
	}
	return false;
}

function debugStreet( street, intersections) {
	const interesting = intersections.filter( (i) => (i.streets.includes(street)));
	for (const i of interesting) {
		console.log(i);
	}
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
			//	console.log(node, nameSet);

			// offsets can mean there are 2 intersections of the same streets!!!
			// e.g. Dohr and Ashby (2)
			let intString = makeIntersectionString(nameSet);

			if (setOfIntersections.has(intString)) {
				for (let suffix = 2; suffix < 10; suffix++) {
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

			if (intString.includes("Buchanan")) {
			//	console.log("break ", intString)
			}
		}
	}

	var obj = { intersections: [] }
	for (const [int, data] of setOfIntersections) {

		if (true || inBerkeley({ lon: data.lon, lat: data.lat })) {
			//console.log(gps, int);
			const intersection = { coordinates: [data.lat, data.lon], raw: int, streets: clean(int), nodeId: data.nodeId };
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

function makeIntersectionGeoJson(intersections) {

	const arrFeatures = [];
	for (const intersection of intersections) {
		const lat = intersection.coordinates[0];
		const lon = intersection.coordinates[1];

		const coords = [lon, lat]

		const streets = intersection.streets.split(slash);
		const properties = { 'streets': streets };
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


// read city boundary
const landBoundaryJson = JSON.parse(readFileSync('./data/cityboundary/Land_Boundary.geojson', 'utf8'));
const cityBoundaryFeature = landBoundaryJson.features[0];  // geojson feature
var cityPoly = polygon(cityBoundaryFeature.geometry.coordinates); // turf polygon

//var wayJson = JSON.parse(readFileSync('./data/ways_alamedacounty.json', 'utf8'));
var wayJson = JSON.parse(readFileSync(inputFile, 'utf8'));
var wayData = initWayData(wayJson);
findDeadEnds(wayJson);

const obj = findintersections(wayData);

const geoJson = makeIntersectionGeoJson(obj.intersections);
//writeFileSync('./data/intersections_alamedacounty.geojson', JSON.stringify(geoJson, null, ' '));
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


