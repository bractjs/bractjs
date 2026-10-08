export { filePathToPattern, isRouteGroupSegment, layoutDirsFromFilePath, pathToSegments, type RouteFile, type Segment, } from "../shared/route-patterns.ts";
import { type RouteFile, type Segment } from "../shared/route-patterns.ts";
export declare function scanRoutes(appDir: string): Promise<RouteFile[]>;
/** A route's segments as a React Router pattern: `/blog/:id`, `/docs/:lang?`, `/files/*`. */
export declare function routePatternOf(segments: Segment[]): string;
