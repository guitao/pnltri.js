// pnltri.js / raw.github.com/jahting/pnltri.js/master/LICENSE
/**
 * @author jahting / http://www.ameco.tv/
 *
 *	(Simple) Polygon Near-Linear Triangulation
 *
 */
 
var PNLTRI = { REVISION: '0.8' };

//	#####  Global Constants  #####


//	#####  Global Variables  #####


/**
 * @author jahting / http://www.ameco.tv/
 */

PNLTRI.Math = {

	log2: function ( inNum ) {
		// return	Math.log2(inNum);			// not everywhere defined !!
		return	Math.log(inNum)/Math.LN2;
	},

	random: Math.random,		// function to use for random number generation

	// generate random ordering in place:
	//	Fisher-Yates shuffle
	array_shuffle: function( inoutArray ) {
		for (var i = inoutArray.length - 1; i > 0; i-- ) {
			var j = Math.floor( PNLTRI.Math.random() * (i+1) );
			var tmp = inoutArray[i];
			inoutArray[i] = inoutArray[j];
			inoutArray[j] = tmp;
		}
		return	inoutArray;
	},

	ptsCrossProd: function ( inPtVertex, inPtFrom, inPtTo ) {
		// two vectors: ( inPtVertex -> inPtFrom ), ( inPtVertex -> inPtTo )
		return	( inPtFrom.x - inPtVertex.x ) * ( inPtTo.y - inPtVertex.y ) -
				( inPtFrom.y - inPtVertex.y ) * ( inPtTo.x - inPtVertex.x );
		// <=> crossProd( inPtFrom-inPtVertex, inPtTo-inPtVertex )
		// == 0: colinear (angle == 0 or 180 deg == PI rad)
		// > 0:  v lies left of u
		// < 0:  v lies right of u
	},

}

// precision of floating point arithmetic
//	PNLTRI.Math.EPSILON_P = Math.pow(2,-32);	// ~ 0.0000000001
	PNLTRI.Math.EPSILON_P = Math.pow(2,-43);	// ~ 0.0000000000001
	PNLTRI.Math.EPSILON_N = -PNLTRI.Math.EPSILON_P;

//	Problem with EPSILON-compares:
//	- especially when there is a x-coordinate ordering on equal y-coordinates
//		=> either NO EPSILON-compares on y-coordinates, since almost equal y
//			can have very different x - so they are not nearly close
//		or EPSILON must be bigger: Solution so far.
/**
 * @author jahting / http://www.ameco.tv/
 */

/** @constructor */
PNLTRI.PolygonData = function ( inPolygonChainList ) {

	// list of polygon vertices
	//	.x, .y: coordinates
	//	.outSegs: Array of outgoing segments from this point
	//		{ vertTo: next vertex, segOut: outgoing segments-Entry }
	// outSegs[0] is the original polygon segment, the others are added
	//  during the subdivision into uni-y-monotone polygons
	this.vertices = [];

	// list of polygon segments, original and additional ones added
	//  during the subdivision into uni-y-monotone polygons (s. this.monoSubPolyChains)
	// doubly linked by: snext, sprev
	this.segments = [];
	
	// indices into this.segments: at least one for each monoton chain for the polygon
	//  these subdivide the polygon into uni-y-monotone polygons, that is
	//  polygons that have only one segment between ymax and ymin on one side
	//  and the other side has monotone increasing y from ymin to ymax
	// the monoSubPolyChains are doubly linked by: mnext, mprev
	this.monoSubPolyChains = [];
	
	// list of triangles: each 3 indices into this.vertices
	this.triangles = [];
	
	// initialize optional polygon chains
	if ( inPolygonChainList ) {
		this.addPolygonChain( inPolygonChainList[0], false );		// contour
		for (var i=1, j=inPolygonChainList.length; i<j; i++) {		// holes
			this.addPolygonChain( inPolygonChainList[i], true );
		}
	}

};


PNLTRI.PolygonData.prototype = {

	constructor: PNLTRI.PolygonData,
	
	
	/*	Accessors  */
	
	getSegments: function () {
		return	this.segments;
	},
	getMonoSubPolys: function () {
		return	this.monoSubPolyChains;
	},
	getTriangles: function () {
		return	this.triangles.concat();
	},

		
	/*	Helper  */
	
	//	like compare (<=>)
	//		yA > yB resp. xA > xB: 1, equal: 0, otherwise: -1
	compare_pts_yx: function ( inPtA, inPtB ) {
		var deltaY = inPtA.y - inPtB.y;
		if ( deltaY > PNLTRI.Math.EPSILON_P ) {
			return 1;
		} else if ( deltaY < PNLTRI.Math.EPSILON_N ) {
			return -1;
		} else {
			var deltaX = inPtA.x - inPtB.x;
			if ( deltaX > PNLTRI.Math.EPSILON_P ) {
				return  1;
			} else if ( deltaX < PNLTRI.Math.EPSILON_N ) {
				return -1;
			} else {
				return  0;
			}
		}
	},

	// calculates the area of a polygon
	polygon_area: function ( inContour ) {
		var cLen = inContour.length;
		var dblArea = 0.0;
		for( var p = cLen - 1, q = 0; q < cLen; p = q++ ) {
			dblArea += inContour[ p ].x * inContour[ q ].y - inContour[ q ].x * inContour[ p ].y;
		}
		return dblArea * 0.5;
	},

	
	/*	Operations  */
	
	appendVertexEntry: function ( inVertex ) {			// private
		var vertex = inVertex ? inVertex : {
			x: null,		// coordinates
			y: null,
			outSegs: [],	// outbound segments (up to 4)
			};
		vertex.id = this.vertices.length;
		this.vertices.push( vertex );
		return	vertex;
	},


	createSegmentEntry: function ( inVertexFrom, inVertexTo ) {			// private
		return	{
			// end points of segment
			vFrom: inVertexFrom,	// -> start point entry in vertices
			vTo: inVertexTo,		// -> end point entry in vertices
			// upward segment? (i.e. vTo > vFrom)
			upward: ( this.compare_pts_yx(inVertexTo, inVertexFrom) == 1 ),
			// double linked list of original polygon chains (not the monoChains !)
			sprev: null,			// previous segment
			snext: null,			// next segment
		};
	},
	
	appendSegmentEntry: function ( inSegment ) {				// private
		this.segments.push( inSegment );
		if ( this.monoSubPolyChains.length == 0 ) {
			this.monoSubPolyChains = [ this.segments[0] ];
		}
		return	inSegment;
	},
	

	addVertexChain: function ( inRawPointList, inIsHole ) {			// private
		
		function verts_equal( inVert1, inVert2 ) {
			return ( ( Math.abs(inVert1.x - inVert2.x) < PNLTRI.Math.EPSILON_P ) &&
					 ( Math.abs(inVert1.y - inVert2.y) < PNLTRI.Math.EPSILON_P ) );
		}
		
		var reverse = false;
		if ( inIsHole != null ) {		// adapt segment direction to polygon chain type ?
			var orientation = ( this.polygon_area( inRawPointList ) < 0 );		// CW ?
			reverse = ( inIsHole != orientation );
		}
		//
		var newVertices = [];
		var newVertex, acceptVertex, prevIdx;
		for ( var i=0; i < inRawPointList.length; i++ ) {
			newVertex = this.appendVertexEntry( { x: inRawPointList[i].x,
												  y: inRawPointList[i].y } );
			// suppresses zero-length segments
			acceptVertex = true;
			prevIdx = newVertices.length-1;
			if ( ( prevIdx >= 0 ) &&
				 verts_equal( newVertex, newVertices[prevIdx] ) ) {
			 	acceptVertex = false;
			}
			if ( acceptVertex )	newVertices.push( newVertex );
		}
		// compare last vertex to first: suppresses zero-length segment
		if ( ( newVertices.length > 1 ) &&
			 verts_equal( newVertices[newVertices.length-1], newVertices[0] ) ) {
			newVertices.pop();
		}
		if ( reverse ) {
			// console.log( "Polygon chain reversed! " + newVertices[0].x + "/" + newVertices[0].y );
			newVertices = newVertices.reverse();		// vertex-index preserving reversal !!!
		}
		
		return	newVertices;
	},
	

	addPolygonChain: function ( inRawPointList, inIsHole ) {			// <<<<<< public
		
		// vertices
		var newVertices = this.addVertexChain( inRawPointList, inIsHole );
		if ( newVertices.length < 3 ) {
			console.log( "Polygon has < 3 vertices!", newVertices );
			return	0;
		}
		
		// segments
		var	saveSegListLength = this.segments.length;
		//
		var	segment, firstSeg, prevSeg;
		for ( var i=0; i < newVertices.length-1; i++ ) {
			segment = this.createSegmentEntry( newVertices[i], newVertices[i+1] );
			if (prevSeg) {
				segment.sprev = prevSeg;
				prevSeg.snext = segment;
			} else {
				firstSeg = segment;
			}
			prevSeg = segment;
			this.appendSegmentEntry( segment );
		}
		// close polygon
		segment = this.createSegmentEntry( newVertices[newVertices.length-1], newVertices[0] );
		segment.sprev = prevSeg;
		prevSeg.snext = segment;
		this.appendSegmentEntry( segment );
		firstSeg.sprev = segment;
		segment.snext = firstSeg;
		
		return	this.segments.length - saveSegListLength;
	},
	

	/* Monotone Polygon Chains */
	
	initMonoChains: function () {										// <<<<<< public
		// populate links for monoChains and vertex.outSegs
		for (var i = 0; i < this.segments.length; i++) {
			// already visited during unique monoChain creation ?
			this.segments[i].marked = false;
			// double linked list for monotone chains (sub-polygons)
			this.segments[i].mprev = this.segments[i].sprev;
			this.segments[i].mnext = this.segments[i].snext;
			// out-going segments of a vertex (max: 4)
//			this.segments[i].vFrom.outSegs = [ {vertTo: this.segments[i].snext.vFrom, 	// next vertex: first outgoing segment
			this.segments[i].vFrom.outSegs = [ { segOut: this.segments[i],			// first outgoing segment
												 vertTo: this.segments[i].vTo } ];	// next vertex: other end of outgoing segment
		}
	},

	
	appendVertexOutsegEntry: function ( inVertexFrom, inOutSegEntry ) {
		var outSegEntry = inOutSegEntry ? inOutSegEntry : {
			segOut: null,		// -> segments: outgoing segment
			vertTo: null,		// -> next vertex: other end of outgoing segment
			};
		inVertexFrom.outSegs.push( outSegEntry );
		return	outSegEntry;
	},


	// Split the polygon chain (mprev, mnext !) including vert0 and vert1 into
	// two chains by adding two new segments (vert0, vert1) and (vert0, vert1).
	// vert0 and vert1 are specified in CCW order with respect to the
	// current polygon (index: currPoly).
	//
	// returns an index to the new polygon chain.

	splitPolygonChain: function ( currPoly, vert0, vert1 ) {			// <<<<<< public

		function get_out_segment_next_right_of(vert0, vert1) {

			// monotone mapping of the CCW angle between the wo vectors:
			//	inPtVertex->inPtFrom and inPtVertex->inPtTo
			//  from 0..360 degrees onto the range of 0..4
			// result-curve (looking like an upward stair/wave) is:
			//	  0 to 180 deg: 1 - cos(theta)
			//  180 to 360 deg: 2 + cos(theta)    (same shape as for 0-180 but pushed up)

			function mapAngle( inPtVertex, inPtFrom, inPtTo ) {
			
				function vectorLength(v0) {		// LENGTH
					return	Math.sqrt( v0.x * v0.x + v0.y * v0.y );
				}
				function dotProd(v0, v1) {
					// DOT: cos(theta) * len(v0) * len(v1)
					return	( v0.x * v1.x + v0.y * v1.y );
				}
				function crossProd(v0, v1) {
					// CROSS_SINE: sin(theta) * len(v0) * len(v1)
					return	( v0.x * v1.y - v1.x * v0.y );
					// == 0: colinear (theta == 0 or 180 deg == PI rad)
					// > 0:  v lies left of u
					// < 0:  v lies right of u
				}
				
				var v0 = {	x: inPtFrom.x - inPtVertex.x,			// Vector inPtVertex->inPtFrom
							y: inPtFrom.y - inPtVertex.y }
				var v1 = {	x: inPtTo.x - inPtVertex.x,				// Vector inPtVertex->inPtTo
							y: inPtTo.y - inPtVertex.y }
				var cosine = dotProd(v0, v1)/vectorLength(v0)/vectorLength(v1);
																	// CCW angle from inPtVertex->inPtFrom
				if ( crossProd(v0, v1) >= 0 )	return 1-cosine;	// to inPtTo <= 180 deg. (convex, to the left)
				else							return 3+cosine;	// to inPtTo > 180 deg. (concave, to the right)
			}


			var tmpSeg, tmpAngle;

			// search for the outSegment "segRight" so that the angle between
			//	vert0->segRight.vertTo and vert0->vert1 is smallest
			//	=> vert0->segRight.vertTo is the next to the right of vert0->vert1

			var segRight = null;
			var minAngle = 4.0;			// <=> 360 degrees
			for (var i = 0; i < vert0.outSegs.length; i++) {
				tmpSeg = vert0.outSegs[i]
				if ( ( tmpAngle = mapAngle( vert0, tmpSeg.vertTo, vert1 ) ) < minAngle ) {
					minAngle = tmpAngle;
					segRight = tmpSeg;
				}
			}
			return	segRight;
		}


		// (vert0, vert1) is the new diagonal to be added to the polygon.

		// find chains and outSegs to use for vert0 and vert1
		var vert0outSeg = get_out_segment_next_right_of(vert0, vert1);
		var vert1outSeg = get_out_segment_next_right_of(vert1, vert0);
		
		var segOutFromVert0 = vert0outSeg.segOut;
		var segOutFromVert1 = vert1outSeg.segOut;
		
		// modify linked lists
		var upward = ( this.compare_pts_yx(vert0, vert1) == 1 );
		var newSegPolyOrg = this.appendSegmentEntry( { vFrom: vert0, vTo: vert1, upward: !upward,
							mprev: segOutFromVert0.mprev, mnext: segOutFromVert1 } );
		var newSegPolyNew = this.appendSegmentEntry( { vFrom: vert1, vTo: vert0, upward: upward,
							mprev: segOutFromVert1.mprev, mnext: segOutFromVert0 } );
		
		segOutFromVert0.mprev.mnext = newSegPolyOrg;
		segOutFromVert1.mprev.mnext = newSegPolyNew;
		
		segOutFromVert0.mprev = newSegPolyNew;
		segOutFromVert1.mprev = newSegPolyOrg;
		
		// populate "outgoing segment" from vertices
		this.appendVertexOutsegEntry( vert0, { segOut: newSegPolyOrg, vertTo: vert1 } );
		this.appendVertexOutsegEntry( vert1, { segOut: newSegPolyNew, vertTo: vert0 } );

		this.monoSubPolyChains[currPoly] = segOutFromVert1;		// initially creates [0] on empty list !!
		this.monoSubPolyChains.push(segOutFromVert0);
		
		return	this.monoSubPolyChains.length - 1;				// index -> new monoSubPoly
	},
	
	// For each monotone polygon, find the ymax (to determine the two
	// y-monotone chains) and skip duplicate monotone polygons
	
	unique_monotone_chains_max: function () {		// private
		var frontMono, monoPosmax;
		var frontPt, firstPt, ymaxPt;
		
		var i;
		for ( i=0; i<this.segments.length; i++ ) { this.segments[i].marked = false; }
		
		var	uniqueMonoChainsMax = [];
		for ( i=0; i<this.monoSubPolyChains.length; i++ ) {
			// loop through uni-monotone chains
			frontMono = monoPosmax = this.monoSubPolyChains[i];
			firstPt = ymaxPt = frontMono.vFrom;

			frontMono.marked = true;
			frontMono = frontMono.mnext;
			
			var processed = false;
			while ( (frontPt = frontMono.vFrom) != firstPt ) {
				if (frontMono.marked) {
					processed = true;
					break;		// break from while
				} else {
					frontMono.marked = true;
				}
				if ( this.compare_pts_yx( frontPt, ymaxPt ) == 1 ) {
					ymaxPt = frontPt;
					monoPosmax = frontMono;
				}
				frontMono = frontMono.mnext;
			}	// end while
			if (processed) continue;		// Go to next polygon
			uniqueMonoChainsMax.push(monoPosmax);
		}	// end for
		//
		return	uniqueMonoChainsMax;
	},
	
	normalize_monotone_chains: function () {			// <<<<<< public
		this.monoSubPolyChains = this.unique_monotone_chains_max();
		return	this.monoSubPolyChains.length;
	},

	
	/* Triangles */
	
	clearTriangles: function () {
		this.triangles = [];
	},
	
	addTriangle: function ( inVert1, inVert2, inVert3 ) {
		this.triangles.push( [ inVert1.id, inVert2.id, inVert3.id ] );
	},
	
};

/**
 * @author jahting / http://www.ameco.tv/
 *
 *	Algorithm to create the trapezoidation of a polygon with holes
 *	 according to Seidel's algorithm [Sei91]
 */

// for splitting trapezoids
//  on which segment lies the point defining the top or bottom y-line?
//	all combinations are possible, except two cusps
PNLTRI.TRAP_MIDDLE	= 0;		// middle: 2 neighbors, separated by a cusp
PNLTRI.TRAP_LEFT	= 1;		// left: point lies on the left segment
PNLTRI.TRAP_RIGHT	= 2;		// right: point lies on the right segment
PNLTRI.TRAP_CUSP	= 1+2;		// cusp: point is the tip of a cusp of a triangular trapezoid
								//	lying on the left and right segment

PNLTRI.trapCnt = 0;		// Sequence for trapezoid IDs

/** @constructor */
PNLTRI.Trapezoid = function ( inHigh, inLow, inLeft, inRight ) {
	
	this.trapID = PNLTRI.trapCnt++;			// for Debug

	this.vHigh = inHigh ? inHigh : { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
	this.vLow  = inLow  ? inLow  : { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
	
	this.lseg = inLeft;
	this.rseg = inRight;
		
//	this.sink = null;			// link to corresponding node (T_SINK) in QueryStructure
		
//	this.usave = null;			// temp: uL/uR, preserved for next step
//	this.uside = null;			// temp: PNLTRI.S_LEFT(uL), PNLTRI.S_RIGHT(uR)
	
	this.depth = -1;			// no depth assigned yet
	
	this.monoDiag = null;		// splitting diagonal during monotonization ?
	
};

PNLTRI.Trapezoid.prototype = {

	constructor: PNLTRI.Trapezoid,

	clone: function () {
		var newTrap = new PNLTRI.Trapezoid( this.vHigh, this.vLow, this.lseg, this.rseg );
		
		newTrap.uL = this.uL;
		newTrap.uR = this.uR;
		newTrap.u0 = this.uL;
		newTrap.u1 = this.uR;
		newTrap.topLoc = this.topLoc;
		
		newTrap.dL = this.dL;
		newTrap.dR = this.dR;
		newTrap.d0 = this.dL;
		newTrap.d1 = this.dR;
		newTrap.botLoc = this.botLoc;
		
		newTrap.sink = this.sink;

		return	newTrap;
	},

	
	setAbove: function ( inTrap1, inTrap2 ) {
		this.uL = inTrap1;
		this.uR = inTrap2;
		this.u0 = inTrap1;
		this.u1 = inTrap2;
	},
	setBelow: function ( inTrap1, inTrap2 ) {
		this.dL = inTrap1;
		this.dR = inTrap2;
		this.d0 = inTrap1;
		this.d1 = inTrap2;
	},

	setSink: function ( inQsSink ) {
		this.sink = inQsSink;
	},

	
	replaceAbove: function ( inTrapOld, inTrapNew ) {
		if ( this.uL == inTrapOld ) {
			this.uL = inTrapNew;
			this.u0 = inTrapNew;
		} else if ( this.uR == inTrapOld ) {
			this.uR = inTrapNew;
			this.u1 = inTrapNew;
		}
	},

	
	splitOffLower: function ( inSplitPt ) {
		var trLower = this.clone();				// new lower trapezoid
		
		this.vLow = trLower.vHigh = inSplitPt;
		this.botLoc = trLower.topLoc = PNLTRI.TRAP_MIDDLE;
		
		this.setBelow( trLower, null);		// L/R unknown, anyway changed later
		trLower.setAbove( this, null );		// L/R unknown, anyway changed later
		
		if ( trLower.dL )	trLower.dL.replaceAbove( this, trLower );
		if ( trLower.dR )	trLower.dR.replaceAbove( this, trLower );
		
		return	trLower;
	},

};


/*==============================================================================
 *
 *============================================================================*/

// QS-Node types
PNLTRI.T_Y = 1;
PNLTRI.T_X = 2;
PNLTRI.T_SINK = 3;

// for split-direction
PNLTRI.S_LEFT = 1;
PNLTRI.S_RIGHT = 2;

PNLTRI.qsCounter = 0;

/** @constructor */
PNLTRI.QsNode = function ( inNodetype, inParent, inData ) {

	this.qsNodeID = PNLTRI.qsCounter++;			// for Debug

	this.nodetype = inNodetype;
	
	if ( inData ) {
		if ( inNodetype == PNLTRI.T_Y )
			this.yval = inData;
		else if ( inNodetype == PNLTRI.T_X )
			this.seg = inData;
		else	// PNLTRI.T_SINK
			this.trap = inData;
	}
};

PNLTRI.QsNode.prototype = {

	constructor: PNLTRI.QsNode,

	
	newRight: function ( inNodetype, inData ) {

		this.right = new PNLTRI.QsNode( inNodetype, this, inData );

		return this.right;
	},

	newLeft: function ( inNodetype, inData ) {

		this.left = new PNLTRI.QsNode( inNodetype, this, inData );

		return this.left;
	},


};


/*==============================================================================
 *
 *============================================================================*/

/** @constructor */
PNLTRI.QueryStructure = function ( inPolygonData ) {
	// initialise the query structure and trapezoid list
	PNLTRI.trapCnt = 0;
	PNLTRI.qsCounter = 0;
	
	this.root = new PNLTRI.QsNode( PNLTRI.T_SINK, null, null );

	var initialTrap = new PNLTRI.Trapezoid( null, null, null, null );
	initialTrap.setSink( this.root );
	this.root.trap = initialTrap;

	this.trapArray = [ initialTrap ];

	this.segListArray = null;
	if ( inPolygonData ) {
		this.segListArray = inPolygonData.getSegments();
		/*
		 * adds and initializes specific attributes for all segments
		 *	// -> QueryStructure: roots of partial tree where vertex is located
		 *	rootFrom, rootTo:	for vFrom, vTo
		 *	// marker
		 *	is_inserted:	already inserted into QueryStructure ?
		 */
		for ( var i = 0; i < this.segListArray.length; i++ ) {
			this.segListArray[i].rootFrom = this.segListArray[i].rootTo = this.root;
			this.segListArray[i].is_inserted = false;
		}
		this.compare_pts_yx = inPolygonData.compare_pts_yx;
	} else {
		var myPolygonData = new PNLTRI.PolygonData( null );
		this.compare_pts_yx = myPolygonData.compare_pts_yx;
	}
};

PNLTRI.QueryStructure.prototype = {

	constructor: PNLTRI.QueryStructure,

	getRoot: function () {
		return this.root;
	},
	getSegListArray: function () {
		return this.segListArray;
	},
		
	
	cloneTrap: function ( inTrapezoid ) {
		var trap = inTrapezoid.clone();
		this.trapArray.push( trap );
		return	trap;
	},
	
	
	splitNodeAtPoint: function ( inNode, inPoint, inReturnUpper ) {
		// inNode: PNLTRI.T_SINK with trapezoid containing inPoint
		var trUpper = inNode.trap;							// trUpper: trapezoid includes the point
		if (trUpper.vHigh == inPoint)	return	inNode;				// (ERROR) inPoint is already inserted
		if (trUpper.vLow == inPoint)	return	inNode;				// (ERROR) inPoint is already inserted
		var trLower = trUpper.splitOffLower( inPoint );		// trLower: new lower trapezoid
		this.trapArray.push( trLower );
		
		inNode.nodetype = PNLTRI.T_Y;
		inNode.yval = inPoint;
		inNode.trap = null;		// no SINK anymore !!
		
		trUpper.sink = inNode.newRight( PNLTRI.T_SINK, trUpper );	// Upper trapezoid sink
		trLower.sink = inNode.newLeft( PNLTRI.T_SINK, trLower );		// Lower trapezoid sink
		
		return	inReturnUpper ? trUpper.sink : trLower.sink;
	},


	/*
	 * Mathematics & Geometry helper methods
	 */

	fpEqual: function ( inNum0, inNum1 ) {
		 return		Math.abs( inNum0 - inNum1 ) < PNLTRI.Math.EPSILON_P;
	},

	
	// Returns TRUE if the trapezoid is triangular and lies inside the polygon.
	// !! depends on the correct orientation of segments (contour: CCW, hole: CW) !!
	
	inside_polygon: function ( inTrap ) {

		var rseg = inTrap.rseg;
		
		if ( !inTrap.lseg || !inTrap.rseg )		return false;
		
		if ( ( !inTrap.uL && !inTrap.uR ) || ( !inTrap.dL && !inTrap.dR ) ) {
			// triangle shaped trapezoid
			//  CCW ordering of the contour segments:
			//	 right segment is going upwards <=> triangle is inside the polygon
			return ( rseg.upward );
		}
		
		return false;
	},


	// Checks, whether the vertex inPt is to the left of line segment inSeg.
	//	Returns:
	//		>0: inPt is left of inSeg,
	//		<0: inPt is right of inSeg,
	//		=0: inPt is co-linear with inSeg
	//
	//	ATTENTION: always viewed from -y, not as if moving along the segment chain !!
	 
	is_left_of: function ( inSeg, inPt, inBetweenY ) {
		var	retVal, retVal2;
		var dXfrom = inSeg.vFrom.x - inPt.x;
		var dXto = inSeg.vTo.x - inPt.x;
		if ( Math.abs( inSeg.vTo.y - inPt.y ) < PNLTRI.Math.EPSILON_P ) {
			retVal = dXto; retVal2 = dXfrom;
		} else if ( Math.abs( inSeg.vFrom.y - inPt.y ) < PNLTRI.Math.EPSILON_P ) {
			retVal = dXfrom; retVal2 = dXto;
//		} else if ( inBetweenY && ( dXfrom * dXto > 0 ) ) {
			// both x-coordinates of inSeg are on the same side of inPt
//			retVal = dXto; retVal2 = dXfrom;
		} else {
			if ( inSeg.upward ) {
				return	PNLTRI.Math.ptsCrossProd( inSeg.vFrom, inSeg.vTo, inPt );
			} else {
				return	PNLTRI.Math.ptsCrossProd( inSeg.vTo, inSeg.vFrom, inPt );
			}
		}
		if ( Math.abs( retVal ) < PNLTRI.Math.EPSILON_P ) {
			if ( Math.abs( retVal2 ) < PNLTRI.Math.EPSILON_P )	return	0;
			return	retVal2;
		}
		return	retVal;
	},


	/*
	 * Query structure main methods
	 */
	
	//	This method finds the Node in the QueryStructure corresponding
	//   to the trapezoid that contains inPt, starting from Node inQsNode.
	//  If inPt lies on a border (y-line or segment) inPtOther is used
	//	 to determine on which side.
	
	ptNode: function ( inPt, inPtOther, inQsNode ) {

		var compPt, compRes;
		var sideRightAbove = true;			// above, right
		switch (inQsNode.nodetype) {
			case PNLTRI.T_SINK:		return inQsNode;
			case PNLTRI.T_Y:
				compPt = inPt;
				if ( compPt == inQsNode.yval )	compPt = inPtOther;				// the point is already inserted.
				compRes = this.compare_pts_yx( compPt, inQsNode.yval );
				if ( compRes == -1 )								sideRightAbove = false;		// below
/*				if ( compRes == 0 ) {			// TODO: Testcase
					console.log("ptNode: Pts too close together#1: ", compPt, inQsNode.yval );
				}		*/
				break;
			case PNLTRI.T_X:
				if ( ( inPt == inQsNode.seg.vFrom ) ||						// the point is already inserted.
					 ( inPt == inQsNode.seg.vTo ) ) {
					if ( this.fpEqual( inPt.y, inPtOther.y ) ) {
						// horizontal segment
						if ( inPtOther.x < inPt.x )		sideRightAbove = false;		// left
						break;
					} else {
						compRes = this.is_left_of( inQsNode.seg, inPtOther, false );
						if ( compRes > 0 )				sideRightAbove = false;		// left
						else if ( compRes == 0 ) {
							// co-linear reversal
							//	a co-linear continuation would not reach this point
							//  since the previous Y-node comparison would have led to a sink instead
//							console.log("ptNode: co-linear, going back on previous segment", inPt, inPtOther, inQsNode );
							// now as we have two consecutive co-linear segments we have to avoid a cross-over
							//	for this we need the far point on the "next" segment to the shorter of our two
							//	segments to avoid that "next" segment to cross the longer of our two segments
							if ( inPt == inQsNode.seg.vFrom ) {
								// connected at inQsNode.seg.vFrom
//								console.log("ptNode: co-linear, going back on previous segment, connected at inQsNode.seg.vFrom", inPt, inPtOther, inQsNode );
								sideRightAbove = true;				// ??? TODO: for test_add_segment_spezial_4B !!
							} else {
								// connected at inQsNode.seg.vTo
//								console.log("ptNode: co-linear, going back on previous segment, connected at inQsNode.seg.vTo", inPt, inPtOther, inQsNode );
								sideRightAbove = false;				// ??? TODO: for test_add_segment_spezial_4A !!
							}
						}
					}
					break;
				} else { 
/*					if ( ( this.compare_pts_yx( compPt, inQsNode.seg.vFrom ) *			// TODO: Testcase
					 	    this.compare_pts_yx( compPt, inQsNode.seg.vTo )
					 	   ) == 0 ) {
						console.log("ptNode: Pts too close together#2: ", compPt, inQsNode.seg );
					}		*/
					compPt = inPt;
					compRes = this.is_left_of( inQsNode.seg, compPt, true );
					if ( compRes > 0 )				sideRightAbove = false;		// left
					else if ( compRes == 0 ) {
						// ???TODO: for test_add_segment_spezial_4B !!
						// sideRightAbove = false;		// left
						sideRightAbove = true;		// right
					}
				}
				break;
			default:
				console.log("ptNode: undef. NodeType: ", inQsNode.nodetype);
		}
		if ( sideRightAbove )	return this.ptNode( inPt, inPtOther, inQsNode.right);
		else					return this.ptNode( inPt, inPtOther, inQsNode.left);
	},


 	// Add a new segment into the trapezoidation and update QueryStructure and Trapezoids
	// 1) locates the two endpoints of the segment in the QueryStructure and inserts them
	// 2) goes from the high-end trapezoid down to the low-end trapezoid
	//		changing all the trapezoids in between.
	// Except for the high-end and low-end no new trapezoids are created.
	// For all in between either:
	// - the existing trapezoid is restricted to the left of the new segment
	//		and on the right side the trapezoid from above is extended downwards
	// - or the other way round:
	//	 the existing trapezoid is restricted to the right of the new segment
	//		and on the left side the trapezoid from above is extended downwards
	
	add_segment: function ( inSegment ) {
		var scope = this;
		
		// functions handling the relationship to the upper neighbors (uL, uR)
		//	of trNewLeft and trNewRight
		
		function	fresh_seg_or_upward_cusp() {
			// trCurrent has at most 1 upper neighbor
			//	and should also have at least 1, since the high-point trapezoid
			//	has been split off another one, which is now above
			var trUpper = trCurrent.uL || trCurrent.uR;

			if ( trUpper.dL && trUpper.dR ) {
				// upward cusp: top forms a triangle

				// ATTENTION: the decision whether trNewLeft or trNewRight is the
				//	triangle trapezoid formed by the two segments has already been taken
				//	when selecting trCurrent as the left or right lower neighbor to trCurrent.uL !!
				
				if ( trCurrent == trUpper.dR ) {
					//	*** Case: FUC_UC_RIGHT; prev: ----
					// console.log( "fresh_seg_or_upward_cusp: upward cusp, new seg from the right!" );
					// !! trNewLeft and trNewRight cannot have been extended from above !!
					//		  upper
					//   -------*-------
					//		   / +
					//		  /   +	 NR
					//		 /	NL +
					//		/		+
					trNewLeft.setAbove( null, null );
					trNewLeft.topLoc = PNLTRI.TRAP_CUSP;
					trNewRight.topLoc = PNLTRI.TRAP_LEFT;
					trNewRight.setAbove( null, trUpper );			// uL: unchanged -- TODO: always BOTH unchanged?
					trUpper.setBelow( trUpper.dL, trNewRight );		// dL: unchanged, NEVER null
				} else {
					//	*** Case: FUC_UC_LEFT; prev: ----
					// console.log( "fresh_seg_or_upward_cusp: upward cusp, new seg to the left!" );
					// !! trNewLeft and trNewRight cannot have been extended from above !!
					//		  upper
					//   -------*-------
					//		   + \
					//	  NL  +   \
					//		 +	NR \
					//		+		\
					trNewRight.setAbove( null, null );
					trNewRight.topLoc = PNLTRI.TRAP_CUSP;
					trNewLeft.topLoc = PNLTRI.TRAP_RIGHT;
					trNewLeft.setAbove( trUpper, null );			// uL: unchanged -- TODO: always BOTH unchanged?
					trUpper.setBelow( trNewLeft, trUpper.dR );		// dR: unchanged, NEVER null
				}
			} else {
				//	*** Case: FUC_FS; prev: ----
				// console.log( "fresh_seg_or_upward_cusp: fresh segment, high adjacent segment still missing" );
				// !! trNewLeft and trNewRight cannot have been extended from above !!
				//		  upper
				//   -------*-------
				//		   +
				//	  NL  +
				//		 +	NR
				//		+
				trNewLeft.setAbove( trUpper, null );			// TODO: redundant, if dL is default for unknown L/R ?
				trNewLeft.topLoc = PNLTRI.TRAP_RIGHT;
				trNewRight.topLoc = PNLTRI.TRAP_LEFT;
				trNewRight.setAbove( null, trUpper );
				trUpper.setBelow( trNewLeft, trNewRight );
			}
 		}
		
		function	continue_chain_from_above() {
			// trCurrent has at least 2 upper neighbors
			if ( trCurrent.usave ) {
				// 3 upper neighbors (part II)
				if ( trCurrent.uside == PNLTRI.S_LEFT ) {
					//	*** Case: CC_3UN_LEFT; prev: 1B_3UN_LEFT
					// console.log( "continue_chain_from_above: 3 upper neighbors (part II): u0a, u0b, uR(usave)" );
					// => left gets one, right gets two of the upper neighbors
					// !! trNewRight cannot have been extended from above
					//		and trNewLeft must have been !!
					//		   +		/
					//	  C.uL  + C.uR / C.usave
					//   --------+----*----------
					//		NL	  +		NR
					trNewRight.setAbove( trCurrent.uR, trCurrent.usave );
					trNewRight.uL.setBelow( trNewRight, null );
					trNewRight.uR.setBelow( null, trNewRight );
				} else {
					//	*** Case: CC_3UN_RIGHT; prev: 1B_3UN_RIGHT
					// console.log( "continue_chain_from_above: 3 upper neighbors (part II): uL(usave), u1a, u1b" );
					// => left gets two, right gets one of the upper neighbors
					// !! trNewLeft cannot have been extended from above
					//		and trNewRight must have been !!
					//			\		 +
					//	 C.usave \ C.uL + C.uR
					//   ---------*----+-------
					//			NL    +   NR
					trNewLeft.setAbove( trCurrent.usave, trCurrent.uL );
					trNewLeft.uL.setBelow( trNewLeft, null );
					trNewLeft.uR.setBelow( null, trNewLeft );
				}
				trNewLeft.usave = trNewRight.usave = null;
			} else if ( trCurrent.vHigh == trFirst.vHigh ) {		// && meetsHighAdjSeg ??? TODO
				//	*** Case: CC_2UN_CONN; prev: ----
				// console.log( "continue_chain_from_above: 2 upper neighbors, fresh seg, continues high adjacent seg" );
				// !! trNewLeft and trNewRight cannot have been extended from above !!
				//	  C.uL	 /  C.uR
				//   -------*---------
				//	   NL  +	NR
				trNewRight.setAbove( null, trCurrent.uR );			// uR unchanged ?
				trNewRight.uR.setBelow( null, trNewRight );
				trNewRight.topLoc = PNLTRI.TRAP_LEFT;
				trNewLeft.topLoc = PNLTRI.TRAP_RIGHT;
				trNewLeft.setAbove( trCurrent.uL, null );
			} else {
				//	*** Case: CC_2UN; prev: 1B_1UN_CONT, 2B_NCON_RIGHT, 2B_NCON_LEFT, 2B_NCON_TOUCH
				// console.log( "continue_chain_from_above: simple case, 2 upper neighbors (no usave, not fresh seg)" );
				// !! trNewLeft OR trNewRight will have been extended from above !!
				//	  C.uL	 +  C.uR
				//   -------+---------
				//	   NL  +	NR
				if ( changeRightUp ) {
					trNewRight.setAbove( trCurrent.uR, null );
					// second parameter is NOT always null (prev: 2B_NCON_LEFT, 2B_NCON_TOUCH)
					trNewRight.uL.setBelow( trNewRight, trNewRight.uL.dR );		// dR: unchanged
				}
				if ( changeLeftUp )	trNewLeft.setAbove( null, trCurrent.uL );
			}
 		}
		
		// functions handling the relationship to the lower neighbors (dL, dR)
		//	of trNewLeft and trNewRight
		
		function	only_one_trap_below( inTrNext ) {
			// console.log( "only_one_trap_below: (act.vLow.y, last.vLow.y)", trCurrent.vLow.y, trLast.vLow.y );
			// make trNewLeft and trNewRight the upper neighbors of the sole lower trapezoid inTrNext
			if ( ( trCurrent.vLow == trLast.vLow ) && meetsLowAdjSeg ) {	// meetsLowAdjSeg necessary? TODO
				// downward cusp: bottom forms a triangle
				
				// ATTENTION: the decision whether trNewLeft or trNewRight is the
				//	triangle trapezoid formed by the two segments has already been taken
				//	when selecting trLast to the right or left of segLowAdjSeg !!
				
				if ( trCurrent.rseg == segLowAdjSeg ) {
					//	*** Case: 1B_DC_LEFT; next: ----
					// console.log( "only_one_trap_below: downward cusp, new seg from the left!" );
					//		+		/
					//		 +  NR /
					//	  NL  +	  /
					//		   + /
					//   -------*-------
					//		  next
					trNewLeft.setBelow( inTrNext, null );
					trNewLeft.botLoc = PNLTRI.TRAP_RIGHT;
					trNewRight.botLoc = PNLTRI.TRAP_CUSP;
					trNewRight.setBelow( null, null );
					inTrNext.setAbove( trNewLeft, inTrNext.uR );	// uR: unchanged, NEVER null
				} else {
					//	*** Case: 1B_DC_RIGHT; next: ----
					// console.log( "only_one_trap_below: downward cusp, new seg to the right!" );
					//		\		+
					//		 \  NL +
					//		  \	  +  NR
					//		   \ +
					//   -------*-------
					//		  next
					trNewRight.setBelow( null, inTrNext );
					trNewRight.botLoc = PNLTRI.TRAP_LEFT;
					trNewLeft.botLoc = PNLTRI.TRAP_CUSP;
					trNewLeft.setBelow( null, null );
					inTrNext.setAbove( inTrNext.uL, trNewRight );	// uL: unchanged, NEVER null
				}
			} else {
				if ( inTrNext.uL && inTrNext.uR ) {
					// inTrNext has two upper neighbors
					// => a segment ends on the upper Y-line of inTrNext
					// => inTrNext has temporarily 3 upper neighbors
					// => marks whether the new segment cuts through
					//		uL or uR of inTrNext and saves the other in .usave
					if ( inTrNext.uL == trCurrent ) {
						//	*** Case: 1B_3UN_LEFT; next: CC_3UN_LEFT
						// console.log( "only_one_trap_below: inTrNext has 3 upper neighbors (part I): u0a, u0b, uR(usave)" );
						//		 +		  /
						//	  NL  +	 NR	 /
						//		   +	/
						//   -------+--*----
						//			 +
						//		  next
						inTrNext.usave = inTrNext.uR;
						inTrNext.uside = PNLTRI.S_LEFT;

						trNewLeft.setBelow( inTrNext, null );		// L/R undefined, will be extended down and changed anyway
						trNewRight.setBelow( inTrNext, null );
					} else {
						//	*** Case: 1B_3UN_RIGHT; next: CC_3UN_RIGHT
						// console.log( "only_one_trap_below: inTrNext has 3 upper neighbors (part I): uL(usave), u1a, u1b" );
						//	 \		   +
						//	  \	  NL  +  NR
						//	   \	 +
						//   ---*---+-------
						//		   +
						//		  next
						inTrNext.usave = inTrNext.uL;
						inTrNext.uside = PNLTRI.S_RIGHT;

						trNewLeft.setBelow( null, inTrNext );
						trNewRight.setBelow( null, inTrNext );		// L/R undefined, will be extended down and changed anyway
					}		    
				} else {
					if ( trCurrent.vLow == trLast.vLow ) {
						//	*** Case: 1B_1UN_END; next: ----
						// console.log( "only_one_trap_below: simple case, new seg ends here, low adjacent seg still missing" );
						//			  +
						//		NL	 +  NR
						//			+
						//   ------*-------
						//		  next
						trNewLeft.botLoc = PNLTRI.TRAP_RIGHT;
						trNewRight.botLoc = PNLTRI.TRAP_LEFT;
						
						trNewLeft.setBelow( inTrNext, null );
						trNewRight.setBelow( null, inTrNext );
					} else {
						//	*** Case: 1B_1UN_CONT; next: CC_2UN
						// console.log( "only_one_trap_below: simple case, new seg continues down" );
						//			  +
						//		NL	 +  NR
						//			+
						//   ------+-------
						//	 	  +
						//		next
						
						// L/R in one case undefined, which one is not fixed
						//	but that one will be extended down and changed anyway
						trNewLeft.setBelow( null, inTrNext );		// if defined, vLow is to the left
						trNewRight.setBelow( inTrNext, null );		// if defined, vLow is to the right
					}
				}
				inTrNext.setAbove( trNewLeft, trNewRight );
			}
		}
	
		function two_trap_below() {
			// Find out which one (dL,dR) is intersected by this segment and
			//	continue down that one
			var trNext;
			if ( ( trCurrent.vLow == trLast.vLow ) && meetsLowAdjSeg ) {	// meetsLowAdjSeg necessary? TODO
				//	*** Case: 2B_CON_END; next: ----
				// console.log( "two_trap_below: finished, meets low adjacent segment" );
				//			  +
				//		NL	 +  NR
				//			+
				//   ------*-------
				//	 		\  C.dR
				//	  C.dL	 \
				trCurrent.dL.setAbove( trNewLeft, null );
				trCurrent.dR.setAbove( null, trNewRight );
				
				trNext = trCurrent.dR;		// temporary store, in case: trCurrent == trNewLeft
				trNewLeft.setBelow( trCurrent.dL, null );
				trNewRight.setBelow( null, trNext );

				trNewLeft.botLoc = PNLTRI.TRAP_RIGHT;
				trNewRight.botLoc = PNLTRI.TRAP_LEFT;
				
				trNext = null;	      	// segment finished
			} else {
				// passes left or right of an already inserted NOT connected segment
				//	trCurrent.vLow: high-end of existing segment
				var compRes = scope.is_left_of( inSegment, trCurrent.vLow, true );
				if ( compRes > 0 ) {				// trCurrent.vLow is left of inSegment
					//	*** Case: 2B_NCON_RIGHT; next: CC_2UN
					// console.log( "two_trap_below: (intersecting dR)" );
					//		 +
					//	  NL  +  NR
					//		   +
					//   ---*---+-------
					//		 \	 +
					//	 C.dL \	C.dR
					trNext = trCurrent.dR;
					
					trCurrent.dL.setAbove( trNewLeft, null );
					trCurrent.dR.setAbove( trNewLeft, trNewRight );
					
					// change FIRST trNewLeft then trNewRight !!
					trNewLeft.setBelow( trCurrent.dL, trCurrent.dR );
					trNewRight.setBelow( null, trCurrent.dR );		// L/R undefined, will be extended down and changed anyway
				} else if ( compRes < 0 ) {			// trCurrent.vLow is right of inSegment
					//	*** Case: 2B_NCON_LEFT; next: CC_2UN
					// console.log( "two_trap_below: (intersecting dL)" );
					//			  +
					//		NL	 +  NR
					//			+
					//   ------+---*-------
					//	 	  +		\  C.dR
					//	 	 C.dL	 \
					trNext = trCurrent.dL;
		
					trCurrent.dL.setAbove( trNewLeft, trNewRight );
					trCurrent.dR.setAbove( null, trNewRight );
					
					// change FIRST trNewRight then trNewLeft !!
					trNewRight.setBelow( trCurrent.dL, trCurrent.dR );
					trNewLeft.setBelow( trCurrent.dL, null );		// L/R undefined, will be extended down and changed anyway
				} else {							// trCurrent.vLow lies ON inSegment
					//	*** Case: 2B_NCON_TOUCH_LEFT; next: CC_2UN
					// console.log( "two_trap_below: vLow ON new segment, touching from left" );
					//			  +
					//		NL	 +  NR
					//			+
					//   ------*-------
					//	 	  +	\  C.dR
					//	  C.dL	 \
					trNext = trCurrent.dL;				// TODO: for test_add_segment_spezial_4A -> like intersecting dL
		
					trCurrent.dL.setAbove( trNewLeft, trNewRight );
					trCurrent.dR.setAbove( null, trNewRight );
					
					// change FIRST trNewRight then trNewLeft !!
					trNewRight.setBelow( trCurrent.dL, trCurrent.dR );
					trNewLeft.setBelow( trCurrent.dL, null );		// L/R undefined, will be extended down and changed anyway
					//
					// OR:			TODO
					//	*** Case: 2B_NCON_TOUCH_RIGHT; next: CC_2UN
					// console.log( "two_trap_below: vLow ON new segment, touching from right" );
					//		 +
					//	  NL  +  NR
					//		   +
					//   -------*-------
					//		   / +
					//	 C.dL /	C.dR
//					trNext = trCurrent.dR;				// TODO: -> like intersecting dR
				}
			}	    
			
 			return	trNext;
		}

		//
		//	function body
		//
		
		var segHighPt, segHighRoot, segHighAdjSeg;		// y-max vertex
		var segLowPt , segLowRoot , segLowAdjSeg;		// y-min vertex
		
/*		if ( ( inSegment.sprev.vTo != inSegment.vFrom ) || ( inSegment.vTo != inSegment.snext.vFrom ) ) {
			console.log( "add_segment: inconsistent point order of adjacent segments: ",
						 inSegment.sprev.vTo, inSegment.vFrom, inSegment.vTo, inSegment.snext.vFrom );
			return;
		}		*/
		
		if ( inSegment.upward ) {
			segLowPt	= inSegment.vFrom;
			segHighPt	= inSegment.vTo;
			segLowRoot		= inSegment.rootFrom;
			segHighRoot		= inSegment.rootTo;
			segLowAdjSeg	= inSegment.sprev;
			segHighAdjSeg	= inSegment.snext;
		} else {
			segLowPt	= inSegment.vTo;
			segHighPt	= inSegment.vFrom;
			segLowRoot		= inSegment.rootTo;
			segHighRoot		= inSegment.rootFrom;
			segLowAdjSeg	= inSegment.snext;
			segHighAdjSeg	= inSegment.sprev;
		}

		var qs_area, meetsLowAdjSeg = false;

		//	insert higher point into QueryStructure
		//		Get the top-most intersecting trapezoid
		qs_area = this.ptNode( segHighPt, segLowPt, segHighRoot );
		if ( !segHighAdjSeg.is_inserted ) {
			// higher point not yet inserted => split trapezoid horizontally
			qs_area = this.splitNodeAtPoint( qs_area, segHighPt, false );
		}
		var trFirst = qs_area.trap;		// top-most trapezoid

		//	insert lower point into QueryStructure
		//		Get the bottom-most intersecting trapezoid
		qs_area = this.ptNode( segLowPt, segHighPt, segLowRoot );
		if ( !segLowAdjSeg.is_inserted ) {
			// lower point not yet inserted => split trapezoid horizontally
			qs_area = this.splitNodeAtPoint( qs_area, segLowPt, true );
		} else {
			// lower point already inserted earlier => segments meet at the end
			meetsLowAdjSeg = true;
		}
		var trLast = qs_area.trap;			// bottom-most trapezoid
		
		//
		// Thread the segment into the query tree creating a new X-node first,
		//	then split all the trapezoids which are intersected by
		//	inSegment into two
		// Traverse from top to bottom
		//

		var trCurrent = trFirst;
		
		var qs_trCurrent;
		var trNewLeft, trNewRight, trPrevLeft, trPrevRight;
		var changeLeftUp, changeRightUp;
		
		var counter = this.trapArray.length + 2;		// just to prevent infinite loop
		var trNext;
		while ( trCurrent ) {
			if ( --counter < 0 ) {
				console.log( "ERR add_segment: infinite loop", trCurrent, inSegment, this );
				return;
			}
			if ( !trCurrent.dL && !trCurrent.dR ) {
				// ERROR: no successors, cannot arise if data is correct
				console.log( "ERR add_segment: missing successors", trCurrent, inSegment, this );
				return;
			}
			
			qs_trCurrent = trCurrent.sink;
			qs_trCurrent.nodetype = PNLTRI.T_X;
			qs_trCurrent.seg = inSegment;
			qs_trCurrent.trap = null;			// no SINK anymore !!!
			//
			// successive trapezoids bordered by the same segments are merged
			//  by extending the trPrevRight or trPrevLeft down
			//  and redirecting the parent PNLTRI.T_X-Node to the extended sink
			// !!! destroys tree structure since several nodes now point to the same PNLTRI.T_SINK !!!
			// TODO: maybe it's not a problem;
			//  merging of PNLTRI.T_X-Nodes is no option, since they are used as "rootFrom/rootTo" !
			//
			changeLeftUp = changeRightUp = true;
			if ( trPrevRight && ( trPrevRight.rseg == trCurrent.rseg ) ) {
				changeRightUp = false;
				// console.log( "add_segment: extending right predecessor down!", trPrevRight );
				trNewLeft = trCurrent;
				trNewRight = trPrevRight;
				trNewRight.vLow = trCurrent.vLow;
				trNewRight.botLoc = trCurrent.botLoc;
				// redirect parent PNLTRI.T_X-Node to extended sink
				qs_trCurrent.right = trPrevRight.sink;
				trNewLeft.sink  = qs_trCurrent.newLeft( PNLTRI.T_SINK, trNewLeft );		// left trapezoid sink (use existing one)
			} else if ( trPrevLeft && ( trPrevLeft.lseg == trCurrent.lseg ) ) {
				changeLeftUp = false;
				// console.log( "add_segment: extending left predecessor down!", trPrevLeft );
				trNewRight = trCurrent;
				trNewLeft = trPrevLeft;
				trNewLeft.vLow = trCurrent.vLow;
				trNewLeft.botLoc = trCurrent.botLoc;
				// redirect parent PNLTRI.T_X-Node to extended sink
				qs_trCurrent.left = trPrevLeft.sink;
				trNewRight.sink = qs_trCurrent.newRight( PNLTRI.T_SINK, trNewRight );	// right trapezoid sink (use existing one)
			} else {
				trNewLeft = trCurrent;
				trNewRight = this.cloneTrap(trCurrent); 								// split-right: (allocate new)
				trNewRight.sink = qs_trCurrent.newRight( PNLTRI.T_SINK, trNewRight );	// right trapezoid sink
				trNewLeft.sink  = qs_trCurrent.newLeft( PNLTRI.T_SINK, trNewLeft );		// left trapezoid sink (use existing one)
			}
		
			// handle neighbors above
			if ( trCurrent.uL && trCurrent.uR )	{
				continue_chain_from_above();
			} else {
				fresh_seg_or_upward_cusp();
			}

			// handle neighbors below
			if ( trCurrent.dL && trCurrent.dR ) {
				trNext = two_trap_below();
			} else {
				if ( trCurrent.dL ) {
					// console.log( "add_segment: only_one_trap_below! (dL)" );
					trNext = trCurrent.dL;
				} else {
					// console.log( "add_segment: only_one_trap_below! (dR)" );
					trNext = trCurrent.dR;
				}
				only_one_trap_below( trNext );
			}
      
			trNewLeft.rseg = trNewRight.lseg  = inSegment;

			// further loop-step down ?
			if ( trCurrent.vLow != trLast.vLow ) {
				trPrevLeft = trNewLeft;
				trPrevRight = trNewRight;
				
				trCurrent = trNext;
			} else {
				trCurrent = null;
			}
		}	// end while
		
		inSegment.is_inserted = true;
		// console.log( "add_segment: ###### DONE ######" );
	},

	
	// Find one triangular trapezoid which lies inside the polygon
	
	find_first_inside: function () {
		for (var i=0, j=this.trapArray.length; i<j; i++) { 
			if ( this.inside_polygon( this.trapArray[i] ) ) {
				return this.trapArray[i];
			}
		}
		return	null;
	},

	
};


/*==============================================================================
 *
 *============================================================================*/

/** @constructor */
PNLTRI.Trapezoider = function ( inPolygonData ) {

	this.polyData		= inPolygonData;
	this.queryStructure	= new PNLTRI.QueryStructure( this.polyData );
	
};

PNLTRI.Trapezoider.prototype = {

	constructor: PNLTRI.Trapezoider,


	/*
	 * Mathematics & Geometry helper methods
	 */

	//
	//	The two CENTRAL methods for the near-linear performance	!!!
	//
	math_logstar_n: function ( inNum ) {
		var i, v;
		for ( i = 0, v = inNum; v >= 1; i++ ) { v = PNLTRI.Math.log2(v) }
		return	( i - 1 );
	},
	math_NH: function ( inN, inH ) {
		var i, v;
		for ( i = 0, v = inN; i < inH; i++ ) { v = PNLTRI.Math.log2(v) }
		return	Math.ceil( 1.0 * inN / v );
	},

	
	/*
	 * main methods
	 */

	// To speed up the segment insertion into the trapezoidation
	//	the endponts of those segments not yet inserted are
	//	repeatedly pre-located,
	// thus the their final location-query can start at the top
	//	of the appropriate sub-tree instead of the root of the
	//	whole query structure.
	
	find_new_roots: function ( inSegment ) {					// <<<< private
		if ( !inSegment.is_inserted ) {
			inSegment.rootFrom = this.queryStructure.ptNode( inSegment.vFrom, inSegment.vTo, inSegment.rootFrom );
			inSegment.rootTo = this.queryStructure.ptNode( inSegment.vTo, inSegment.vFrom, inSegment.rootTo );
		}
	},

	// Creates the trapezoidation of the polygon
	//  and returns one triangular trapezoid which lies inside the polygon.
	// All other inside trapezoids can be reached from this one using the
	//	neighbor links.
	
	trapezoide_polygon: function () {							// <<<< public
		
		var randSegListArray = this.queryStructure.segListArray.slice(0);
		PNLTRI.Math.array_shuffle( randSegListArray );
//		this.random_sequence_log( randSegListArray );
		
		var i, h;
		var anzSegs = randSegListArray.length;

		var logStarN = this.math_logstar_n(anzSegs);
		for (h = 1; h <= logStarN; h++) {
			for (i = this.math_NH(anzSegs, h -1); i < this.math_NH(anzSegs, h); i++) {
				this.queryStructure.add_segment( randSegListArray[i-1] );
//				this.queryStructure.add_segment_consistently( randSegListArray[i-1], 'RandomA#'+(i-1) );
			}
			// Find a new sub-tree root for each of the segment endpoints
			for (i = 0; i < anzSegs; i++) {
				this.find_new_roots( randSegListArray[i] );
			}
		}
		
		for (i = this.math_NH( anzSegs, logStarN ); i <= anzSegs; i++) {
			this.queryStructure.add_segment( randSegListArray[i-1] );
//			this.queryStructure.add_segment_consistently( randSegListArray[i-1], 'RandomB#'+(i-1) );
		}
		
		return	this.queryStructure.find_first_inside();
	},

};

/**
 * @author jahting / http://www.ameco.tv/
 *
 *	Algorithm to split a polygon into uni-y-monotone sub-polygons
 *
 *	1) creates a trapezoidation of the main polygon according to Seidel's
 *	   algorithm [Sei91]
 *	2) traverses the trapezoids and uses diagonals as additional segments
 *		to split the main polygon into uni-y-monotone sub-polygons
 */

// for splitting trapezoids
PNLTRI.TRAP_NOSPLIT = -1;	// no diagonal

/** @constructor */
PNLTRI.MonoSplitter = function ( inPolygonData ) {
	
	this.polyData = inPolygonData;
	
	this.trapezoider = null;
	
	// trianglular trapezoid inside the polygon,
	//	from which the monotonization is started
	this.startTrap	= null;
	
};

	
PNLTRI.MonoSplitter.prototype = {

	constructor: PNLTRI.MonoSplitter,
	
	
	monotonate_trapezoids: function () {					// <<<<<<<<<< public
		
		// Trapezoidation
		this.trapezoider = new PNLTRI.Trapezoider( this.polyData );
		//	=> one triangular trapezoid which lies inside the polygon
		this.startTrap = this.trapezoider.trapezoide_polygon();
				
		// Generate the uni-y-monotone sub-polygons from
		//	the trapezoidation of the polygon.
		//	!!  for the start triangle trapezoid it doesn't matter
		//	!!	from where we claim to enter it
		this.polyData.initMonoChains();
		this.alyTrap( 0, this.startTrap, null, null, null );

		// return number of UNIQUE sub-polygons created
		return	this.polyData.normalize_monotone_chains();
	},

	
	// Splits the current polygon (index: inCurrPoly) into two sub-polygons
	//	using the diagonal (inVertLow, inVertHigh) either from low to high or high to low
	// returns an index to the new sub-polygon
	//
	//	!! public for Mock-Tests only !!

	doSplit: function ( inChain, inVertLow, inVertHigh, inLow2High ) {
		if ( inLow2High ) {
			return this.polyData.splitPolygonChain( inChain, inVertLow, inVertHigh );
		} else {
			return this.polyData.splitPolygonChain( inChain, inVertHigh, inVertLow );
		}
	},

	// In a loop analyses all connected trapezoids for possible splitting diagonals
	//	Inside of the polygon holds:
	//		rseg: always goes upwards
	//		lseg: always goes downwards
	//	This is preserved during the splitting.
		
	alyTrap: function ( inChain, inTrap, inDirection, inFromLeft, inOneStep ) {
		var trapQueue = [], trapQItem = [];
		
		function trapList_addItems( inNewItems ) {
			for (var i=inNewItems.length-1; i>=0; i--) {
				trapQueue.unshift( inNewItems[i] );
			}
		}
		
		function trapList_getItem() {
			return	trapQueue.shift();
		}
		
		if ( inDirection == null ) {
			inFromLeft = true;
			if ( inTrap.u0 )		inDirection = true;
			else if ( inTrap.d0 )	inDirection = false;
			else {
				inFromLeft = false;
				if ( inTrap.u1 )	inDirection = true;
				else				inDirection = false;
			}
		}
		trapList_addItems( [ [ inTrap, inDirection, inFromLeft, inChain ] ] );
		
		while ( trapQItem = trapList_getItem() ) {
			var thisTrap;
			if ( ( thisTrap = trapQItem[0] ) && !thisTrap.monoDiag ) {
			
				if ( !thisTrap.lseg || !thisTrap.rseg ) {
					console.log("ERR alyTrap: lseg/rseg missing", thisTrap);
					thisTrap.monoDiag = PNLTRI.TRAP_NOSPLIT;
					return	trapQueue;
				}
				
				var fromUp = trapQItem[1];
				var fromLeft = trapQItem[2];
				var curChain = trapQItem[3], newChain;
				
				
				var vHigh = thisTrap.vHigh;
				var vLow = thisTrap.vLow;

				var dblOnUp = null;
				var dblSideL, dblSideR;
				if ( thisTrap.topLoc == PNLTRI.TRAP_MIDDLE ) {
					dblOnUp = true;			// double-Side is UP-side
					dblSideL = thisTrap.u0;
					dblSideR = thisTrap.u1;
				}
				if ( thisTrap.botLoc == PNLTRI.TRAP_MIDDLE ) {
					dblOnUp = false;		// double-Side is DN-side
					dblSideL = thisTrap.d0;
					dblSideR = thisTrap.d1;
				}
				var sglSide, sglLeft;

				thisTrap.monoDiag = 1 + 4*thisTrap.topLoc + thisTrap.botLoc;
				
				if ( dblOnUp != null ) {
					// TM|BM: 2 neighbors on at least one side
					
					// first, degenerate case: triangle trapezoid
					if ( ( thisTrap.topLoc == PNLTRI.TRAP_CUSP ) || ( thisTrap.botLoc == PNLTRI.TRAP_CUSP ) ) {
						// TLR_BM, TM_BLR
						// console.log( "triangle (cusp), 2 neighbors on in-side; from " + ( fromLeft ? "left(u0/d0)" : "right(u1/d1)" ) );
						//	could be start triangle -> visit ALL neighbors, no optimization !
						newChain = this.doSplit( curChain, vLow, vHigh, fromLeft );
						trapList_addItems(  [ [ ( fromLeft ? dblSideL : dblSideR ), !fromUp, fromLeft, curChain ],
											  [ ( fromLeft ? dblSideR : dblSideL ), !fromUp, !fromLeft, newChain ] ] );
					// second: trapezoid with 4 (max) neighbors
					} else if ( ( thisTrap.topLoc == PNLTRI.TRAP_MIDDLE ) && ( thisTrap.botLoc == PNLTRI.TRAP_MIDDLE ) ) {
						// TM_BM
						// console.log( "2 trapezoids above & 2 below; from " + ( fromLeft ? "left(u0/d0)" : "right(u1/d1)" ) );
						newChain = this.doSplit( curChain, vLow, vHigh, fromLeft );
						if ( !fromLeft ) {
							var tmp = newChain;
							newChain = curChain;
							curChain = tmp;
						}
						trapList_addItems(  [ [ thisTrap.u0, false, true, curChain ],
											  [ thisTrap.d0, true, true, curChain ],
											  [ thisTrap.u1, false, false, newChain ],
											  [ thisTrap.d1, true, false, newChain ] ] );
					// third: one side with two neighbors
					} else {
						// 2 trapezoids on one side (extern cusp) & 1 on the other side
						if ( dblOnUp ) {
							// 2 trapezoids above, 1 below, sglLeft: vLow to the left?
							sglSide = thisTrap.d0 ? thisTrap.d0 : thisTrap.d1;
							sglLeft = ( thisTrap.botLoc == PNLTRI.TRAP_LEFT );
						} else {
							// 1 trapezoid above, 2 below, sglLeft: vHigh to the left?
							sglSide = thisTrap.u0 ? thisTrap.u0 : thisTrap.u1;
							sglLeft = ( thisTrap.topLoc == PNLTRI.TRAP_LEFT );
						}
						if ( ( fromUp == dblOnUp ) && ( fromLeft == sglLeft ) ) {
							// TM_BL(from UP-left), TL_BM(from DN-left), TM_BR(from UP-right), TR_BM(from DN-right)
							// console.log( "2 neighbors on in-side, 1 on the other with y-point on same l/r-side where we come in." );
							curChain = this.doSplit( curChain, vLow, vHigh, sglLeft );
						} else {
							// TM_BL(from UP-right, DN), TL_BM(from UP, DN-right), TM_BR(from UP-left, DN), TR_BM(from UP, DN-left)
							// console.log( "2 neighbors on one and 1 on the other side, coming from single-side or on double-side not from the l/r-side with the y-point on single-side" );
							newChain = this.doSplit( curChain, vLow, vHigh, !sglLeft );
							trapList_addItems(  [ [ ( sglLeft ? dblSideL : dblSideR ), !dblOnUp, sglLeft, newChain ] ] );
						}
						trapList_addItems(	[ [ ( sglLeft ? dblSideR : dblSideL ), !dblOnUp, !sglLeft, curChain ],
											  [ sglSide, dblOnUp, !sglLeft, curChain ] ] );
					}
				} else {	// ( dblOnUp == null )
					// at most 1 neighbor on any side
					var toUp;
					// first, degenerate case: triangle trapezoid
					if ( ( thisTrap.topLoc == PNLTRI.TRAP_CUSP ) || ( thisTrap.botLoc == PNLTRI.TRAP_CUSP ) ) {
						// triangle (cusp): only one neighbor on in-side, nothing on the other side => no diagonal
						//	could be start triangle -> visit neighbor in any case !
						
						// TLR_BL, TLR_BR; TL_BLR, TR_BLR
						// console.log( "triangle (cusp), one neighbor on in-side; no split possible" );
						thisTrap.monoDiag = PNLTRI.TRAP_NOSPLIT;
						toUp = fromUp;		// going back
					// fourth: both sides with one neighbor
					} else {
						// 1 trapezoid above, 1 below
						if ( thisTrap.topLoc == thisTrap.botLoc ) {		// same side => no diag
							// TL_BL, TR_BR
							// console.log( "1 trapezoid above, 1 below; no split possible" );
							thisTrap.monoDiag = PNLTRI.TRAP_NOSPLIT;
						} else {
							if ( thisTrap.topLoc == PNLTRI.TRAP_LEFT ) {		// && botLoc == RIGHT
								// TL_BR, !fromLeft !!
								// console.log( "1 trapezoid above, 1 below; " + ( fromUp ? "vHigh(left)->vLow(right) (in from above)" : "vLow(right)->vHigh(left) (in from below)" ) );
								curChain = this.doSplit( curChain, vLow, vHigh, !fromUp );
							} else {				// topLoc == RIGHT && botLoc == LEFT
								// TR_BL, fromLeft !!
								// console.log( "1 trapezoid above, 1 below; " + ( fromUp ? "vLow(left)->vHigh(right) (in from above)" : "vHigh(right)->vLow(left) (in from below)" ) );
								curChain = this.doSplit( curChain, vLow, vHigh, fromUp );
							}
						}
						toUp = !fromUp;		// going to other side
					}
					if ( toUp ) {
						sglSide = thisTrap.u0 ? thisTrap.u0 : thisTrap.u1;
						sglLeft = ( thisTrap.topLoc == PNLTRI.TRAP_LEFT );
					} else {
						sglSide = thisTrap.d0 ? thisTrap.d0 : thisTrap.d1;
						sglLeft = ( thisTrap.botLoc == PNLTRI.TRAP_LEFT );
					}
					trapList_addItems(	[ [ sglSide, !toUp, !sglLeft, curChain ] ] );
				}	// end ( dblOnUp == null )
				
			}

			if ( inOneStep )	return trapQueue;
		}
		return	[];
	},

};

/**
 * @author jahting / http://www.ameco.tv/
 *
 *	Algorithm to triangulate uni-y-monotone polygons [FoM84]
 *
 *	expects list of doubly linked monoChains, with Y-max as first vertex
 */


/** @constructor */
PNLTRI.MonoTriangulator = function ( inPolygonData ) {
	
	this.polyData	= inPolygonData;
	
};

	
PNLTRI.MonoTriangulator.prototype = {

	constructor: PNLTRI.MonoTriangulator,
	

	// Pass each uni-y-monotone polygon with start at Y-max for greedy triangulation.
	
	triangulate_all_polygons: function () {					// <<<<<<<<<< public
		var	normedMonoChains = this.polyData.getMonoSubPolys();
		this.polyData.clearTriangles();
		for ( var i=0; i<normedMonoChains.length; i++ ) {
			// loop through uni-y-monotone chains
			// => monoPosmin is next to monoPosmax (left or right)
			var monoPosmax = normedMonoChains[i];
			var prevMono = monoPosmax.mprev;
			var nextMono = monoPosmax.mnext;
			
			if ( nextMono.mnext == prevMono ) {		// already a triangle
				this.polyData.addTriangle( monoPosmax.vFrom, nextMono.vFrom, prevMono.vFrom );
			} else {								// triangulate the polygon
				this.triangulate_single_polygon( monoPosmax );
			}
		}
	},

	//	algorithm to triangulate an uni-y-monotone polygon in O(n) time.[FoM84]
	 
	triangulate_single_polygon: function ( monoPosmax ) {
		var scope = this;
		
		function error_cleanup() {
			// Error in algorithm OR polygon is not uni-y-monotone
			console.log( "ERR uni-y-monotone: only concave angles left", vertBackLog );
			// push all "wrong" triangles => loop ends
			while (vertBackLogIdx > 1) {
				vertBackLogIdx--;
				scope.polyData.addTriangle(	vertBackLog[vertBackLogIdx-1],
											vertBackLog[vertBackLogIdx],
											vertBackLog[vertBackLogIdx+1] );
			}
		}

		//
		// Decisive for this algorithm to work correctly is to make sure
		//  the polygon stays uni-y-monotone when cutting off ears, i.e.
		//  to make sure the top-most and bottom-most vertices are removed last
		// Usually this is done by handling the LHS-case ("LeftHandSide is a single segment")
		//	and the RHS-case ("RightHandSide segment is a single segment")
		//	differently by starting at the bottom for LHS and at the top for RHS.
		// This is not necessary. It can be seen easily, that starting
		//	from the vertext next to top handles both cases correctly.
		//

		var frontMono = monoPosmax.mnext;		// == LHS: YminPoint; RHS: YmaxPoint.mnext
		var endVert = monoPosmax.vFrom;

		var vertBackLog = [ frontMono.vFrom ];
		var vertBackLogIdx = 0;

		frontMono = frontMono.mnext;
		var frontVert = frontMono.vFrom;

		while ( (frontVert != endVert) || (vertBackLogIdx > 1) ) {
			if (vertBackLogIdx > 0) {
				// vertBackLog is not empty
				if ( PNLTRI.Math.ptsCrossProd( frontVert, vertBackLog[vertBackLogIdx-1], vertBackLog[vertBackLogIdx] ) > 0 ) {		// TODO !!
					// convex corner: cut if off
					this.polyData.addTriangle( vertBackLog[vertBackLogIdx-1], vertBackLog[vertBackLogIdx], frontVert );
					vertBackLogIdx--;
				} else {
					// non-convex: add frontVert to the vertBackLog
					vertBackLog[++vertBackLogIdx] = frontVert;
					if (frontVert == endVert)	error_cleanup();	// should never happen !!
					else {
						frontMono = frontMono.mnext;
						frontVert = frontMono.vFrom;
					}
				}
			} else {
				// vertBackLog contains only start vertex:
				//	add frontVert to the vertBackLog and advance frontVert
				vertBackLog[++vertBackLogIdx] = frontVert;
				frontMono = frontMono.mnext;
				frontVert = frontMono.vFrom;
			}
		}
		// reached the last vertex. Add in the triangle formed
		this.polyData.addTriangle( vertBackLog[vertBackLogIdx - 1], vertBackLog[vertBackLogIdx], frontVert );
	},
	
};

/**
 * @author jahting / http://www.ameco.tv/
 */

/*******************************************************************************
 *
 *	Triangulator for Simple Polygons with Holes
 *
 *  polygon with holes:
 *	- one closed contour polygon chain
 *  - zero or more closed hole polygon chains
 *
 *	polygon chain (closed):
 *	- Array of vertex Objects with attributes "x" and "y"
 *		- representing the sequence of line segments
 *		- closing line segment (last->first vertex) is implied
 *		- line segments are non-zero length and non-crossing
 *
 *	"global vertex index":
 *	- vertex number resulting from concatenation all polygon chains (starts with 0)
 *
 *
 *	Parameters (will not be changed):
 *		inPolygonChains:
 *		- Array of polygon chains
 *
 *	Results (are a fresh copy):
 *		triangulate_polygon:
 *		- Array of Triangles ( Array of 3 "global vertex index" values )
 *
 ******************************************************************************/

/** @constructor */
PNLTRI.Triangulator = function () {
	
	this.lastPolyData = null;		// for Debug purposes only
	
};


PNLTRI.Triangulator.prototype = {

	constructor: PNLTRI.Triangulator,

	
	triangulate_polygon: function ( inPolygonChains ) {
		if ( ( !inPolygonChains ) || ( inPolygonChains.length == 0 ) )		return	[];
		//
		// initializes general polygon data structure
		//
		var myPolygonData = new PNLTRI.PolygonData( inPolygonChains );
		//
		// splits polygon into uni-y-monotone sub-polygons
		//
		var	myMonoSplitter = new PNLTRI.MonoSplitter( myPolygonData );
		myMonoSplitter.monotonate_trapezoids();
		//
		// triangulates all uni-y-monotone sub-polygons
		//
		var	myTriangulator = new PNLTRI.MonoTriangulator( myPolygonData );
		myTriangulator.triangulate_all_polygons();
		//
		this.lastPolyData = myPolygonData;
		return	myPolygonData.getTriangles();	// copy of triangle list
	}

	
};

