/*

class to divide a region into bins by lat and lng
in order to speed up finding intersections of lines

divide the region by 0.1 degrees of lat lng

for each line, comput the bbox, and compute a list of boxes the 
line *could* touch

return an iterator through the lines in all those boxes that can be used 
to check intersection

each box has a set of lines that might be in that box
add a line to the boxes it touches

all objects pased in as turf line string features with bboxes

*/

/* alpine county test limits
SW 38.284014499557706, -120.13183309133963
NE 38.939451597004656, -119.54122918573655

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

function truncateFloat(f, fractionDigits) {
	return parseFloat(f.toFixed(fractionDigits))
}
const SLASH = '/'

class classGpsbins {

	/*static minLat = 38;
	static maxLat = 39;

	static minLng = -121;
	static maxLong = -119; */

	static FRACTION_DIGITS = 2;
	static DELTA = 1.0 / (10.0 ** classGpsbins.FRACTION_DIGITS);  

	maxBinCount = 0;

	mapKeyToBin = new Map();  // map string -> Set

	static makeKey(lng, lat) {
		const k = truncateFloat(lng, classGpsbins.FRACTION_DIGITS) + SLASH + truncateFloat(lat, classGpsbins.FRACTION_DIGITS);
		return k;
	}

	static round(f, up) {
		const factor = 10.0**classGpsbins.FRACTION_DIGITS;
		if (up) {
			const retval =Math.ceil(f*factor)/factor;
			return retval
		}
		
		const retval =Math.floor(f*factor)/factor;
		return retval
	}

	static round1(f, up) {
		
		let delta = up ? classGpsbins.DELTA : -this.DELTA;
		const retval = truncateFloat(f + delta / 2, classGpsbins.FRACTION_DIGITS);
		return retval
	}
	hasBin(key) {
		
		const retval = this.mapKeyToBin.get( key);
		return retval;
	}
	getBin(key) {
		if (!this.mapKeyToBin.has( key)) {
			this.mapKeyToBin.set (key, new Set());
		}
		return this.mapKeyToBin.get (key)
	}
	// north west hemisphere only
	addWay(w) {
		const way = w.way;
		const bounds = way.bounds;

		const minLat = classGpsbins.round(bounds.minlat, false);
		const maxLat = classGpsbins.round(bounds.maxlat, true);

		const minLng = classGpsbins.round(bounds.minlon, false)
		const maxLng = classGpsbins.round(bounds.maxlon, true);
		let binCount =0
		for (let lng = minLng; lng <= maxLng; lng += classGpsbins.DELTA) {
			for (let lat = minLat; lat <= maxLat; lat += classGpsbins.DELTA) {

				const k = classGpsbins.makeKey(lng, lat);
				const bin = this.getBin(k);
				bin.add(w);
				binCount++;
			}
		}
		if (binCount > this.maxBinCount) {
			this.maxBinCount = binCount;
		}
	}

	stats() {
		console.log("bin count: ", this.mapKeyToBin.size);
		let maxBinPop = 0;
        let emptyBinCount =0;
		let totalBinCount = 0;

		for (const v of this.mapKeyToBin.values()) {
			if (v.size == 0) {
				emptyBinCount++;
			}
			if (v.size > maxBinPop) {
				maxBinPop = v.size;
			}
			totalBinCount += v.size;
		}
		console.log( 'Max bin Population: ', maxBinPop)
		console.log('Empty bin Count: ', emptyBinCount)
		console.log('Total bin items: ',totalBinCount)
		console.log('Max bins per way: ', this.maxBinCount)
	}



	/*
function* makeCcrsIterator(county) {

	let iterationCount = 0;

	for (let y = Year_First; y <= Year_Last; y++) {
		const k = makeKey(county, y);
		if (mapCountyYearToData.has(k)) {
			const data = mapCountyYearToData.get(k);
			for (const datum of data) {
				iterationCount++;
				yield datum;
			}
		}
	}
	return iterationCount;
}
	*/
	* makeIterator(w) {

		const way = w.way;

		let iterationCount = 0;

		const bounds = way.bounds;

		const minLat = classGpsbins.round(bounds.minlat, false);
		const maxLat = classGpsbins.round(bounds.maxlat, true);

		const minLng = classGpsbins.round(bounds.minlon, false)
		const maxLng = classGpsbins.round(bounds.maxlon, true);
		for (let lng = minLng; lng <= maxLng; lng += classGpsbins.DELTA) {
			for (let lat = minLat; lat <= maxLat; lat += classGpsbins.DELTA) {
				const k = classGpsbins.makeKey(lng, lat);
				const bin = this.hasBin(k)
				if (!bin) {
					continue;
				}
				
				for (const datum of bin) {
					// only return ways with bigger id 
					if (datum.way.id && datum.way.id <= way.id) {
						continue;
					}
					iterationCount++;
					yield datum;
				}
			}
		}

		return iterationCount;
	}
	// looping through way pairs where way1 matches a predicate, and way2 either does not, or does and comes after way in id order
	// 
	* makePredicateIterator(w, pred) {

		const way = w.way;

		let iterationCount = 0;

		const bounds = way.bounds;

		const minLat = classGpsbins.round(bounds.minlat, false);
		const maxLat = classGpsbins.round(bounds.maxlat, true);

		const minLng = classGpsbins.round(bounds.minlon, false)
		const maxLng = classGpsbins.round(bounds.maxlon, true);

		for (let lng = minLng; lng <= maxLng; lng += classGpsbins.DELTA) {
			for (let lat = minLat; lat <= maxLat; lat += classGpsbins.DELTA) {
				const k = classGpsbins.makeKey(lng, lat);
				const bin = this.hasBin(k);
				if (!bin) {
					continue;
				}
				for (const datum of bin) {
					// only return ways with bigger id 
					if (pred(datum.way)) {  // bridge bridge intersections
						if (datum.way.id && datum.way.id <= way.id) {
							continue;
						}
					}
					iterationCount++;
					yield datum;
				}
			}
		}

		return iterationCount;
	}

}
/*
function testround() {
	for (let i =0; i<100;i++) {
		const t = (Math.random() - 0.5)*100;
		const v = classGpsbins.round(t)
		const v1 =  classGpsbins.round1(t)

		if (v!=v1) {
			throw "wrong answer"
		}
	}
}

testround();
*/
/*
const bins = new classGpsbins();

const elements =
	[
		{
			"type": "way",
			"id": 6325652,
			"bounds": {
				"minlat": 37.8897045,
				"minlon": -122.3091083,
				"maxlat": 37.891877,
				"maxlon": -122.3088443
			},
			"nodes": [
				53010172,
				8847702260,
				8847702254,
				8847702248,
				8847702266,
				8847702273,
				53010174,
				8847702238,
				8847702232,
				258763779,
				8847702226,
				8847702219,
				8847702242,
				53010176,
				258763794
			],
			"geometry": [
				{
					"lat": 37.891877,
					"lon": -122.3088681
				},
				{
					"lat": 37.8917443,
					"lon": -122.3088562
				},
				{
					"lat": 37.8916188,
					"lon": -122.3088493
				},
				{
					"lat": 37.8914905,
					"lon": -122.3088447
				},
				{
					"lat": 37.8913598,
					"lon": -122.3088443
				},
				{
					"lat": 37.8912263,
					"lon": -122.3088479
				},
				{
					"lat": 37.8910963,
					"lon": -122.3088553
				},
				{
					"lat": 37.8909779,
					"lon": -122.3088666
				},
				{
					"lat": 37.8908547,
					"lon": -122.308882
				},
				{
					"lat": 37.8907263,
					"lon": -122.3089008
				},
				{
					"lat": 37.8906008,
					"lon": -122.3089245
				},
				{
					"lat": 37.8904746,
					"lon": -122.3089496
				},
				{
					"lat": 37.8903505,
					"lon": -122.308975
				},
				{
					"lat": 37.8902241,
					"lon": -122.3090017
				},
				{
					"lat": 37.8897045,
					"lon": -122.3091083
				}
			],
			"tags": {
				"bicycle": "no",
				"destination": "Oakland;San Francisco",
				"destination:ref": "I 580;I 80",
				"hgv": "designated",
				"hgv:national_network": "yes",
				"highway": "motorway",
				"lanes": "2",
				"maxspeed": "65 mph",
				"name": "John T. Knox Freeway",
				"oneway": "yes",
				"ref": "I 580",
				"tiger:cfcc": "A63",
				"tiger:county": "Alameda, CA",
				"tiger:reviewed": "no"
			}
		},
		{
			"type": "way",
			"id": 6326216,
			"bounds": {
				"minlat": 37.892345,
				"minlon": -122.3081676,
				"maxlat": 37.8949985,
				"maxlon": -122.3078003
			},
			"nodes": [
				86276989,
				86276975,
				86276970,
				8847744339,
				86276965,
				8847744342,
				8847744345,
				8847744348,
				86276957,
				8847744324,
				8847744327,
				8847744330,
				86276954,
				8847744333,
				8847744335,
				8847744337,
				86276950,
				86276942
			],
			"geometry": [
				{
					"lat": 37.8949985,
					"lon": -122.3081676
				},
				{
					"lat": 37.89466,
					"lon": -122.3081537
				},
				{
					"lat": 37.8940292,
					"lon": -122.3079741
				},
				{
					"lat": 37.8939149,
					"lon": -122.3079416
				},
				{
					"lat": 37.8938049,
					"lon": -122.3079141
				},
				{
					"lat": 37.8936902,
					"lon": -122.3078931
				},
				{
					"lat": 37.8935663,
					"lon": -122.3078731
				},
				{
					"lat": 37.8934405,
					"lon": -122.3078566
				},
				{
					"lat": 37.8932553,
					"lon": -122.3078363
				},
				{
					"lat": 37.8931549,
					"lon": -122.3078265
				},
				{
					"lat": 37.8930607,
					"lon": -122.3078168
				},
				{
					"lat": 37.8929626,
					"lon": -122.3078098
				},
				{
					"lat": 37.8928689,
					"lon": -122.3078044
				},
				{
					"lat": 37.8927942,
					"lon": -122.3078014
				},
				{
					"lat": 37.8927189,
					"lon": -122.3078003
				},
				{
					"lat": 37.8926351,
					"lon": -122.3078022
				},
				{
					"lat": 37.8923857,
					"lon": -122.3078121
				},
				{
					"lat": 37.892345,
					"lon": -122.3078149
				}
			],
			"tags": {
				"bicycle": "no",
				"destination": "Albany;Buchanan Street",
				"highway": "motorway_link",
				"junction:ref": "13",
				"lanes": "1",
				"lit": "yes",
				"maxspeed:advisory": "30 mph",
				"oneway": "yes",
				"tiger:cfcc": "A63",
				"tiger:county": "Alameda, CA",
				"tiger:reviewed": "no",
				"turn:lanes": "through;right"
			}
		}
	];

bins.addWay(elements[0])
for (const w of bins.makeIterator(elements[1])) {
	console.log (w.id)
}
console.log('bye')

*/
export {classGpsbins};
