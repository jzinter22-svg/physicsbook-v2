/* Tiny reusable SVG function-plotting helper for interactive widgets
   (graphs of motion, waves, fields, or any f(x) relationship). Subject-
   agnostic: callers supply the function and axis ranges. */
(function(){
  "use strict";
  function drawAxes(svg, opts){
    var W = opts.w||520, H = opts.h||360;
    var xmin=opts.xmin, xmax=opts.xmax, ymin=opts.ymin, ymax=opts.ymax;
    var pad = opts.pad||36;
    function toPx(x,y){
      return [ pad + (x-xmin)/(xmax-xmin)*(W-2*pad), H-pad - (y-ymin)/(ymax-ymin)*(H-2*pad) ];
    }
    var ns = "http://www.w3.org/2000/svg";
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox","0 0 "+W+" "+H);

    var gridColor = opts.gridColor || "#c3cbd8";
    var step = opts.step || 1;
    for(var gx=Math.ceil(xmin/step)*step; gx<=xmax; gx+=step){
      var p1=toPx(gx,ymin), p2=toPx(gx,ymax);
      var l=document.createElementNS(ns,"line");
      l.setAttribute("x1",p1[0]);l.setAttribute("y1",p1[1]);l.setAttribute("x2",p2[0]);l.setAttribute("y2",p2[1]);
      l.setAttribute("stroke",gridColor);l.setAttribute("stroke-width", Math.abs(gx)<1e-6?1.4:0.6);
      l.setAttribute("opacity", Math.abs(gx)<1e-6?0.9:0.35);
      svg.appendChild(l);
    }
    for(var gy=Math.ceil(ymin/step)*step; gy<=ymax; gy+=step){
      var q1=toPx(xmin,gy), q2=toPx(xmax,gy);
      var l2=document.createElementNS(ns,"line");
      l2.setAttribute("x1",q1[0]);l2.setAttribute("y1",q1[1]);l2.setAttribute("x2",q2[0]);l2.setAttribute("y2",q2[1]);
      l2.setAttribute("stroke",gridColor);l2.setAttribute("stroke-width", Math.abs(gy)<1e-6?1.4:0.6);
      l2.setAttribute("opacity", Math.abs(gy)<1e-6?0.9:0.35);
      svg.appendChild(l2);
    }
    return { toPx:toPx, W:W, H:H };
  }

  function pathD(fn, xmin, xmax, mapper, steps){
    steps = steps || 240;
    var d = "";
    for(var i=0;i<=steps;i++){
      var x = xmin + (xmax-xmin)*i/steps;
      var y = fn(x);
      if(typeof y !== "number" || !isFinite(y)){ d += ""; continue; }
      var p = mapper.toPx(x,y);
      d += (d===""||d.slice(-1)===" M "?"M ":i===0?"M ":"L ") + p[0].toFixed(2)+" "+p[1].toFixed(2)+" ";
    }
    return d.trim();
  }

  function areaD(fn, x1, x2, mapper, steps){
    steps = steps || 120;
    var d = "";
    var p0 = mapper.toPx(x1, 0);
    d += "M "+p0[0].toFixed(2)+" "+p0[1].toFixed(2)+" ";
    for(var i=0;i<=steps;i++){
      var x = x1 + (x2-x1)*i/steps;
      var y = fn(x);
      var p = mapper.toPx(x,y);
      d += "L "+p[0].toFixed(2)+" "+p[1].toFixed(2)+" ";
    }
    var p1 = mapper.toPx(x2,0);
    d += "L "+p1[0].toFixed(2)+" "+p1[1].toFixed(2)+" Z";
    return d;
  }

  window.PBPlot = { drawAxes:drawAxes, pathD:pathD, areaD:areaD };
})();
