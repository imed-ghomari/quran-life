import { Vec, precise, average } from 'tldraw';

const MIN_START_PRESSURE = 0.025;
const MIN_END_PRESSURE = 0.01;

export function getStrokePoints(rawInputPoints: any[], options: any = {}) {
    const { streamline = 0.5, size = 16, simulatePressure = false } = options;
    if (rawInputPoints.length === 0) return [];
    const t = 0.15 + (1 - streamline) * 0.85;
    let pts = rawInputPoints.map((p) => (p instanceof Vec ? p : new Vec(p.x, p.y, p.z)));

    if (!simulatePressure) {
        let pt2 = pts[0];
        while (pt2) {
            if (pt2.z >= MIN_START_PRESSURE) break;
            pts.shift();
            pt2 = pts[0];
        }
    }
    if (!simulatePressure) {
        let pt2 = pts[pts.length - 1];
        while (pt2) {
            if (pt2.z >= MIN_END_PRESSURE) break;
            pts.pop();
            pt2 = pts[pts.length - 1];
        }
    }
    if (pts.length === 0)
        return [
            {
                point: new Vec(rawInputPoints[0].x, rawInputPoints[0].y, rawInputPoints[0].z),
                input: new Vec(rawInputPoints[0].x, rawInputPoints[0].y, rawInputPoints[0].z),
                pressure: simulatePressure ? 0.5 : 0.15,
                vector: new Vec(1, 1),
                distance: 0,
                runningLength: 0,
                radius: 1
            }
        ];

    let pt = pts[1];
    while (pt) {
        if (Vec.Dist2(pt, pts[0]) > (size / 3) ** 2) break;
        pts[0].z = Math.max(pts[0].z, pt.z);
        pts.splice(1, 1);
        pt = pts[1];
    }
    const last = pts.pop()!;
    pt = pts[pts.length - 1];
    while (pt) {
        if (Vec.Dist2(pt, last) > (size / 3) ** 2) break;
        pts.pop();
        pt = pts[pts.length - 1];
    }
    pts.push(last);

    const strokePoints: any[] = [
        {
            point: pts[0],
            input: pts[0],
            pressure: simulatePressure ? 0.5 : pts[0].z,
            vector: new Vec(1, 1),
            distance: 0,
            runningLength: 0,
            radius: 1
        }
    ];
    let totalLength = 0;
    let prev = strokePoints[0];

    if (streamline > 0) {
        pts.push(pts[pts.length - 1].clone());
    }
    for (let i = 1, n = pts.length; i < n; i++) {
        const point = !t || (options.last && i === n - 1) ? pts[i].clone() : pts[i].clone().lrp(prev.point, 1 - t);
        if (prev.point.equals(point)) continue;
        const distance = Vec.Dist(point, prev.point);
        totalLength += distance;
        if (i < 4 && totalLength < size) {
            continue;
        }
        prev = {
            input: pts[i],
            point,
            pressure: simulatePressure ? 0.5 : pts[i].z,
            vector: Vec.Sub(prev.point, point).uni(),
            distance,
            runningLength: totalLength,
            radius: 1
        };
        strokePoints.push(prev);
    }
    if (strokePoints[1]?.vector) {
        strokePoints[0].vector = strokePoints[1].vector.clone();
    }
    return strokePoints;
}

export function getSvgPathFromStrokePoints(points: any[], closed = false) {
    const len = points.length;
    if (len < 2) {
        return "";
    }
    let a = points[0].point;
    let b = points[1].point;
    if (len === 2) {
        return `M${precise(a)}L${precise(b)}`;
    }
    let result = "";
    for (let i = 2, max = len - 1; i < max; i++) {
        a = points[i].point;
        b = points[i + 1].point;
        result += average(a, b);
    }
    if (closed) {
        return `M${average(points[0].point, points[1].point)}Q${precise(points[1].point)}${average(
            points[1].point,
            points[2].point
        )}T${result}${average(points[len - 1].point, points[0].point)}${average(
            points[0].point,
            points[1].point
        )}Z`;
    } else {
        return `M${precise(points[0].point)}Q${precise(points[1].point)}${average(
            points[1].point,
            points[2].point
        )}${points.length > 3 ? "T" : ""}${result}L${precise(points[len - 1].point)}`;
    }
}
