/*******************************************************************************
 * Copyright (c) 2017 Kiel University and others.
 * Copyright (c) 2026 Open Workflow Editor contributors.
 * SPDX-License-Identifier: EPL-2.0 OR GPL-3.0-or-later
 * Derived from kieler/elkjs 0.12.0's worker entry point.
 *******************************************************************************/
package org.eclipse.elk.js;

import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import com.google.gwt.core.client.EntryPoint;
import com.google.gwt.core.client.JavaScriptObject;
import com.google.gwt.json.client.*;
import org.eclipse.elk.alg.layered.ElkLayered;
import org.eclipse.elk.alg.layered.graph.*;
import org.eclipse.elk.alg.layered.options.*;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.math.ElkPadding;
import org.eclipse.elk.core.math.KVector;
import org.eclipse.elk.core.options.*;
import org.eclipse.elk.core.util.BasicProgressMonitor;

/**
 * Adapter for the editor's flat canvas graph and fixed layered profile.
 * Follows upstream ElkGraphImporter and ElkGraphLayoutTransferrer for these shapes;
 * the layout phases and processors remain upstream implementations.
 */
public class ElkJs implements EntryPoint {
    public void onModuleLoad() {
        LayoutMetaDataService.initElkReflect();
        exportLayout();
    }

    private static native void exportLayout() /*-{
        var profile = '__EDITOR_PROFILE__';
        function FakeWorker() {
            var worker = this;
            this.postMessage = function(message) {
                setTimeout(function() {
                    try {
                        if (message.cmd === 'layout') {
                            var options = message.graph.layoutOptions || {};
                            if (Object.keys(options).length !== Object.keys(profile).length
                                || Object.keys(profile).some(function(key) { return options[key] !== profile[key]; })) {
                                throw new Error('ELK editor profile mismatch: rebuild the layout engine for changed options.');
                            }
                            @org.eclipse.elk.js.ElkJs::layout(*)(message.graph);
                            worker.onmessage({data: {id: message.id, data: message.graph}});
                        } else if (message.cmd === 'register') {
                            worker.onmessage({data: {id: message.id}});
                        } else {
                            worker.onmessage({data: {id: message.id, data: []}});
                        }
                    } catch (error) {
                        worker.onmessage({data: {id: message.id, error: error}});
                    }
                }, 0);
            };
        }
        module.exports = { Worker: FakeWorker };
    }-*/;

    public static void layout(final JavaScriptObject input) {
        JSONObject json = new JSONObject(input);
        LGraph graph = new LGraph();
        // EDITOR_JAVA_OPTIONS
        Set<GraphProperties> graphProperties = EnumSet.noneOf(GraphProperties.class);
        graph.setProperty(InternalProperties.GRAPH_PROPERTIES, graphProperties);

        Map<String, LNode> nodesById = new HashMap<>();
        Map<String, LPort> portsById = new HashMap<>();
        Map<LNode, JSONObject> nodes = new LinkedHashMap<>();
        Map<LPort, JSONObject> ports = new LinkedHashMap<>();
        JSONArray children = json.get("children").isArray();
        for (int i = 0; i < children.size(); i++) {
            JSONObject child = children.get(i).isObject();
            if (child.containsKey("children") || child.containsKey("labels") || child.containsKey("layoutOptions")) {
                throw new IllegalArgumentException("Editor layout adapter expects flattened canvas nodes.");
            }
            LNode node = new LNode(graph);
            graph.getLayerlessNodes().add(node);
            node.getSize().x = number(child, "width");
            node.getSize().y = number(child, "height");
            node.setProperty(LayeredOptions.PORT_CONSTRAINTS, PortConstraints.FREE);
            node.setProperty(InternalProperties.MODEL_ORDER, i);
            nodes.put(node, child);
            nodesById.put(string(child, "id"), node);
            if (child.containsKey("ports")) {
                JSONArray inputPorts = child.get("ports").isArray();
                for (int p = 0; p < inputPorts.size(); p++) {
                    JSONObject inputPort = inputPorts.get(p).isObject();
                    LPort port = new LPort();
                    port.setNode(node);
                    port.getSize().x = number(inputPort, "width");
                    port.getSize().y = number(inputPort, "height");
                    port.setProperty(InternalProperties.MODEL_ORDER, p);
                    LGraphUtil.initializePort(port, PortConstraints.FREE, Direction.DOWN, null);
                    ports.put(port, inputPort);
                    portsById.put(string(inputPort, "id"), port);
                }
            }
        }
        graph.setProperty(InternalProperties.MAX_MODEL_ORDER_NODES, children.size());
        graph.setProperty(InternalProperties.CB_NUM_MODEL_ORDER_GROUPS, 0);
        Map<LEdge, JSONObject> edges = new LinkedHashMap<>();
        JSONArray inputEdges = json.get("edges").isArray();
        for (int i = 0; i < inputEdges.size(); i++) {
            JSONObject edge = inputEdges.get(i).isObject();
            if (edge.get("sources").isArray().size() != 1 || edge.get("targets").isArray().size() != 1) {
                throw new IllegalArgumentException("Canvas edges must have one source and one target.");
            }
            String sourceId = edge.get("sources").isArray().get(0).isString().stringValue();
            String targetId = edge.get("targets").isArray().get(0).isString().stringValue();
            LPort source = portsById.get(sourceId);
            if (source == null) source = LGraphUtil.createPort(nodesById.get(sourceId), null, PortType.OUTPUT, graph);
            LPort target = portsById.get(targetId);
            if (target == null) target = LGraphUtil.createPort(nodesById.get(targetId), null, PortType.INPUT, graph);
            LEdge lEdge = new LEdge();
            lEdge.setSource(source);
            lEdge.setTarget(target);
            lEdge.setProperty(InternalProperties.MODEL_ORDER, i);
            lEdge.setProperty(LayeredOptions.JUNCTION_POINTS, null);
            if (source.getNode() == target.getNode()) graphProperties.add(GraphProperties.SELF_LOOPS);
            if (source.getIncomingEdges().size() > 1 || source.getOutgoingEdges().size() > 1
                    || target.getIncomingEdges().size() > 1 || target.getOutgoingEdges().size() > 1) {
                graphProperties.add(GraphProperties.HYPEREDGES);
            }
            edges.put(lEdge, edge);
        }

        new ElkLayered().doLayout(graph, new BasicProgressMonitor());
        KVector offset = new KVector(graph.getOffset()).add(graph.getPadding().left, graph.getPadding().top);
        number(json, "x", 0);
        number(json, "y", 0);
        number(json, "width", graph.getActualSize().x);
        number(json, "height", graph.getActualSize().y);
        for (Map.Entry<LNode, JSONObject> entry : nodes.entrySet()) {
            LNode shape = entry.getKey();
            JSONObject output = entry.getValue();
            number(output, "x", shape.getPosition().x + offset.x);
            number(output, "y", shape.getPosition().y + offset.y);
            number(output, "width", shape.getSize().x);
            number(output, "height", shape.getSize().y);
        }
        for (Map.Entry<LPort, JSONObject> entry : ports.entrySet()) {
            number(entry.getValue(), "x", entry.getKey().getPosition().x);
            number(entry.getValue(), "y", entry.getKey().getPosition().y);
        }
        for (Map.Entry<LEdge, JSONObject> entry : edges.entrySet()) {
            LEdge edge = entry.getKey();
            JSONObject output = entry.getValue();
            JSONArray sections = new JSONArray();
            {
                JSONObject data = new JSONObject();
                data.put("id", new JSONString(string(output, "id") + "_s0"));
                KVector start = edge.getSource().getAbsoluteAnchor();
                KVector end = edge.getTarget().getAbsoluteAnchor();
                data.put("startPoint", point(start.x + offset.x, start.y + offset.y));
                data.put("endPoint", point(end.x + offset.x, end.y + offset.y));
                if (!edge.getBendPoints().isEmpty()) {
                    JSONArray bends = new JSONArray();
                    for (KVector bend : edge.getBendPoints()) {
                        bends.set(bends.size(), point(bend.x + offset.x, bend.y + offset.y));
                    }
                    data.put("bendPoints", bends);
                }
                data.put("incomingShape", output.get("sources").isArray().get(0));
                data.put("outgoingShape", output.get("targets").isArray().get(0));
                sections.set(0, data);
            }
            if (sections.size() > 0) output.put("sections", sections);
            if (edge.getProperty(CoreOptions.JUNCTION_POINTS) != null) {
                JSONArray points = new JSONArray();
                for (KVector v : edge.getProperty(CoreOptions.JUNCTION_POINTS)) {
                    points.set(points.size(), point(v.x + offset.x, v.y + offset.y));
                }
                if (points.size() > 0) output.put("junctionPoints", points);
            }
            output.put("container", json.get("id"));
        }
    }

    private static String string(JSONObject json, String key) {
        return json.get(key).isString().stringValue();
    }
    private static double number(JSONObject json, String key) {
        return json.containsKey(key) ? json.get(key).isNumber().doubleValue() : 0.0;
    }
    private static void number(JSONObject json, String key, double value) {
        json.put(key, new JSONNumber(value));
    }
    private static JSONObject point(double x, double y) {
        JSONObject result = new JSONObject();
        number(result, "x", x);
        number(result, "y", y);
        return result;
    }
}
