export type Geometry =
  | { kind: 'circle'; radius: number }
  | { height: number; kind: 'rectangle'; width: number };

export function area(geometry: Geometry): number {
  switch (geometry.kind) {
    case 'circle':
      return Math.PI * geometry.radius ** 2;
    case 'rectangle':
      return geometry.height * geometry.width;
  }
}

export function totalArea(geometries: ReadonlyArray<Geometry>): number {
  return geometries.reduce((total, geometry) => total + area(geometry), 0);
}
