/**
 * Esri REST API Service
 * Direct integration with ArcGIS REST endpoints (equivalent to ezesri but for TypeScript/React)
 * 
 * This service provides the same functionality as the Python ezesri library:
 * - get_metadata -> getLayerMetadata
 * - summarize_metadata -> summarizeMetadata
 * - extract_layer -> extractLayer
 * 
 * Works with any public ArcGIS FeatureServer or MapServer endpoint
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EsriField {
  name: string;
  type: string;
  alias: string;
  length?: number;
  domain?: {
    type: string;
    name: string;
    codedValues?: Array<{ code: string | number; name: string }>;
  };
}

export interface EsriExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference: {
    wkid: number;
    latestWkid?: number;
  };
}

export interface EsriLayerMetadata {
  id: number;
  name: string;
  type: string;
  description: string;
  geometryType: string;
  fields: EsriField[];
  extent: EsriExtent;
  maxRecordCount: number;
  supportsQuery: boolean;
  supportsPagination: boolean;
  hasAttachments: boolean;
  objectIdField: string;
  globalIdField?: string;
  capabilities: string;
  currentVersion: number;
  copyrightText?: string;
  drawingInfo?: unknown;
}

export interface EsriFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    x?: number;
    y?: number;
    rings?: number[][][];
    paths?: number[][][];
    points?: number[][];
    spatialReference?: { wkid: number };
  };
}

export interface EsriQueryResponse {
  objectIdFieldName: string;
  globalIdFieldName?: string;
  geometryType: string;
  spatialReference: { wkid: number };
  fields: EsriField[];
  features: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string; details?: string[] };
}

export interface GeoJSONFeature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry | null;
}

export type GeoJSONGeometry = 
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint'; coordinates: Array<[number, number]> }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'MultiLineString'; coordinates: Array<Array<[number, number]>> }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  metadata?: {
    name: string;
    description: string;
    geometryType: string;
    count: number;
    fields: EsriField[];
  };
}

export interface ExtractOptions {
  where?: string;           // SQL WHERE clause (e.g., "STATUS = 'Active'")
  bbox?: [number, number, number, number]; // [xmin, ymin, xmax, ymax] in WGS84
  outFields?: string[];     // Fields to include (default: all)
  outSR?: number;          // Output spatial reference (default: 4326 WGS84)
  maxFeatures?: number;    // Maximum features to fetch
  returnGeometry?: boolean; // Include geometry (default: true)
}

export interface ServiceInfo {
  currentVersion: number;
  serviceDescription: string;
  layers: Array<{ id: number; name: string; type: string }>;
  tables: Array<{ id: number; name: string; type: string }>;
  spatialReference: { wkid: number };
  fullExtent: EsriExtent;
}

export interface MetadataSummary {
  name: string;
  description: string;
  geometryType: string;
  featureCount: string;
  fields: Array<{ name: string; type: string; alias: string }>;
  extent: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  maxRecordCount: number;
  capabilities: string[];
  hasAttachments: boolean;
  copyrightText: string;
}

// ============================================================================
// POPULAR ESRI ENDPOINTS (from ezesri directory)
// ============================================================================

export const POPULAR_ESRI_SERVICES = {
  // Weather & Hazards
  weatherWarnings: {
    name: 'USA Weather Watches and Warnings',
    url: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NWS_Watches_Warnings_v1/FeatureServer/6',
    description: 'Current NWS weather watches, warnings, and advisories'
  },
  currentWildfires: {
    name: 'USA Current Wildfires',
    url: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/USA_Wildfires_v1/FeatureServer/0',
    description: 'Active wildfire perimeters and incidents'
  },
  floodHazards: {
    name: 'USA Flood Hazard Areas',
    url: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28',
    description: 'FEMA flood hazard zones'
  },
  
  // Air Quality & Environment
  airQuality: {
    name: 'EPA Air Quality Monitoring',
    url: 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AirNowLatestContoursCombined/FeatureServer/0',
    description: 'Real-time air quality index contours'
  },
  airMonitoringSites: {
    name: 'EPA AQS Monitoring Sites',
    url: 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/AQS_Monitors/FeatureServer/0',
    description: 'Air quality monitoring station locations'
  },
  
  // Transportation
  trafficIncidents: {
    name: 'Live Traffic Incidents',
    url: 'https://traffic.arcgis.com/arcgis/rest/services/World/Traffic/MapServer/2',
    description: 'Real-time traffic incidents and closures'
  },
  
  // Infrastructure
  powerPlants: {
    name: 'USA Power Plants',
    url: 'https://services.arcgis.com/BG6nSlhZSAWtExvp/arcgis/rest/services/PowerPlants/FeatureServer/0',
    description: 'Power generation facilities'
  },
  
  // Demographics
  zipCodes: {
    name: 'USA ZIP Code Boundaries',
    url: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_ZIP_Codes/FeatureServer/0',
    description: 'ZIP code polygons with population data'
  },
  
  // Storm Reports
  stormReports: {
    name: 'Storm Reports (Last 24 Hours)',
    url: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NWS_Storm_Reports_v1/FeatureServer/0',
    description: 'Recent storm reports including hail, wind, and tornadoes'
  }
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Fetches raw metadata for an Esri layer (equivalent to ezesri.get_metadata)
 */
export async function getLayerMetadata(url: string): Promise<EsriLayerMetadata> {
  // Ensure URL ends with the layer endpoint and has JSON format
  const metadataUrl = url.includes('?') 
    ? `${url}&f=json`
    : `${url}?f=json`;
  
  const response = await fetch(metadataUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
  }
  
  const metadata = await response.json();
  
  if (metadata.error) {
    throw new Error(`Esri API error: ${metadata.error.message || JSON.stringify(metadata.error)}`);
  }
  
  return metadata;
}

/**
 * Returns a human-readable summary of metadata (equivalent to ezesri.summarize_metadata)
 */
export function summarizeMetadata(metadata: EsriLayerMetadata): MetadataSummary {
  const geometryTypeMap: Record<string, string> = {
    'esriGeometryPoint': 'Point',
    'esriGeometryMultipoint': 'MultiPoint',
    'esriGeometryPolyline': 'Line',
    'esriGeometryPolygon': 'Polygon',
    'esriGeometryEnvelope': 'Envelope'
  };

  const fieldTypeMap: Record<string, string> = {
    'esriFieldTypeOID': 'ObjectID',
    'esriFieldTypeInteger': 'Integer',
    'esriFieldTypeSmallInteger': 'SmallInteger',
    'esriFieldTypeDouble': 'Double',
    'esriFieldTypeSingle': 'Float',
    'esriFieldTypeString': 'String',
    'esriFieldTypeDate': 'Date',
    'esriFieldTypeGUID': 'GUID',
    'esriFieldTypeGlobalID': 'GlobalID',
    'esriFieldTypeBlob': 'Blob',
    'esriFieldTypeXML': 'XML'
  };

  // Convert extent to WGS84 if needed (approximate)
  let extent = { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  if (metadata.extent) {
    const e = metadata.extent;
    if (e.spatialReference?.wkid === 4326) {
      extent = { minLat: e.ymin, maxLat: e.ymax, minLng: e.xmin, maxLng: e.xmax };
    } else {
      // Web Mercator or other projection - provide raw values
      extent = { minLat: e.ymin, maxLat: e.ymax, minLng: e.xmin, maxLng: e.xmax };
    }
  }

  return {
    name: metadata.name || 'Unknown',
    description: metadata.description || 'No description available',
    geometryType: geometryTypeMap[metadata.geometryType] || metadata.geometryType || 'Unknown',
    featureCount: 'Query required', // Would need separate query to get count
    fields: (metadata.fields || []).map(f => ({
      name: f.name,
      type: fieldTypeMap[f.type] || f.type,
      alias: f.alias || f.name
    })),
    extent,
    maxRecordCount: metadata.maxRecordCount || 1000,
    capabilities: (metadata.capabilities || '').split(',').map(c => c.trim()),
    hasAttachments: metadata.hasAttachments || false,
    copyrightText: metadata.copyrightText || ''
  };
}

/**
 * Get feature count for a layer
 */
export async function getFeatureCount(url: string, where?: string): Promise<number> {
  const params = new URLSearchParams({
    where: where || '1=1',
    returnCountOnly: 'true',
    f: 'json'
  });

  const queryUrl = `${url}/query?${params.toString()}`;
  const response = await fetch(queryUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to get count: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(`Esri API error: ${result.error.message}`);
  }
  
  return result.count || 0;
}

/**
 * Convert Esri geometry to GeoJSON geometry
 */
function esriToGeoJSON(esriGeometry: EsriFeature['geometry'], geometryType: string): GeoJSONGeometry | null {
  if (!esriGeometry) return null;

  switch (geometryType) {
    case 'esriGeometryPoint':
      if (esriGeometry.x !== undefined && esriGeometry.y !== undefined) {
        return {
          type: 'Point',
          coordinates: [esriGeometry.x, esriGeometry.y]
        };
      }
      break;

    case 'esriGeometryMultipoint':
      if (esriGeometry.points) {
        return {
          type: 'MultiPoint',
          coordinates: esriGeometry.points.map(p => [p[0], p[1]] as [number, number])
        };
      }
      break;

    case 'esriGeometryPolyline':
      if (esriGeometry.paths) {
        if (esriGeometry.paths.length === 1) {
          return {
            type: 'LineString',
            coordinates: esriGeometry.paths[0].map(p => [p[0], p[1]] as [number, number])
          };
        }
        return {
          type: 'MultiLineString',
          coordinates: esriGeometry.paths.map(path => 
            path.map(p => [p[0], p[1]] as [number, number])
          )
        };
      }
      break;

    case 'esriGeometryPolygon':
      if (esriGeometry.rings) {
        // Simple case: single polygon
        if (esriGeometry.rings.length === 1) {
          return {
            type: 'Polygon',
            coordinates: [esriGeometry.rings[0].map(p => [p[0], p[1]] as [number, number])]
          };
        }
        // Multi-ring: could be multipolygon or polygon with holes
        // For simplicity, treat as MultiPolygon
        return {
          type: 'Polygon',
          coordinates: esriGeometry.rings.map(ring => 
            ring.map(p => [p[0], p[1]] as [number, number])
          )
        };
      }
      break;
  }

  return null;
}

/**
 * Extract a layer to GeoJSON (equivalent to ezesri.extract_layer)
 * Handles pagination automatically
 */
export async function extractLayer(
  url: string,
  options: ExtractOptions = {}
): Promise<GeoJSONFeatureCollection> {
  const {
    where = '1=1',
    bbox,
    outFields = ['*'],
    outSR = 4326,
    maxFeatures,
    returnGeometry = true
  } = options;

  // First get metadata to understand the layer
  const metadata = await getLayerMetadata(url);
  const objectIdField = metadata.objectIdField || 'OBJECTID';
  const maxRecordCount = metadata.maxRecordCount || 1000;

  const allFeatures: GeoJSONFeature[] = [];
  let offset = 0;
  let hasMore = true;

  // Build base query parameters
  const baseParams: Record<string, string> = {
    where,
    outFields: outFields.join(','),
    outSR: outSR.toString(),
    returnGeometry: returnGeometry.toString(),
    f: 'json'
  };

  // Add bounding box filter if provided
  if (bbox) {
    baseParams.geometry = JSON.stringify({
      xmin: bbox[0],
      ymin: bbox[1],
      xmax: bbox[2],
      ymax: bbox[3],
      spatialReference: { wkid: 4326 }
    });
    baseParams.geometryType = 'esriGeometryEnvelope';
    baseParams.spatialRel = 'esriSpatialRelIntersects';
    baseParams.inSR = '4326';
  }

  // Paginate through results
  while (hasMore) {
    const params = new URLSearchParams({
      ...baseParams,
      resultOffset: offset.toString(),
      resultRecordCount: maxRecordCount.toString()
    });

    const queryUrl = `${url}/query?${params.toString()}`;
    
    console.log(`Fetching features ${offset} to ${offset + maxRecordCount}...`);
    
    const response = await fetch(queryUrl);
    
    if (!response.ok) {
      throw new Error(`Query failed: ${response.status} ${response.statusText}`);
    }

    const result: EsriQueryResponse = await response.json();

    if (result.error) {
      throw new Error(`Esri API error: ${result.error.message}`);
    }

    // Convert features to GeoJSON
    for (const feature of result.features) {
      const geoJsonFeature: GeoJSONFeature = {
        type: 'Feature',
        id: feature.attributes[objectIdField] as number,
        properties: { ...feature.attributes },
        geometry: returnGeometry 
          ? esriToGeoJSON(feature.geometry, result.geometryType || metadata.geometryType) 
          : null
      };
      allFeatures.push(geoJsonFeature);
    }

    // Check if we need to continue paginating
    const fetchedCount = result.features.length;
    offset += fetchedCount;
    
    // Stop if:
    // - No more features returned
    // - Less than maxRecordCount returned (last page)
    // - We've hit the maxFeatures limit
    if (
      fetchedCount === 0 ||
      fetchedCount < maxRecordCount ||
      (maxFeatures && allFeatures.length >= maxFeatures)
    ) {
      hasMore = false;
    }

    // Respect rate limiting - small delay between requests
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Trim to maxFeatures if specified
  const finalFeatures = maxFeatures 
    ? allFeatures.slice(0, maxFeatures) 
    : allFeatures;

  return {
    type: 'FeatureCollection',
    features: finalFeatures,
    metadata: {
      name: metadata.name,
      description: metadata.description,
      geometryType: metadata.geometryType,
      count: finalFeatures.length,
      fields: metadata.fields
    }
  };
}

/**
 * Get service info (list all layers in a MapServer/FeatureServer)
 */
export async function getServiceInfo(serviceUrl: string): Promise<ServiceInfo> {
  const url = serviceUrl.endsWith('?f=json') 
    ? serviceUrl 
    : `${serviceUrl}?f=json`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch service info: ${response.status}`);
  }

  const info = await response.json();
  
  if (info.error) {
    throw new Error(`Esri API error: ${info.error.message}`);
  }

  return info;
}

/**
 * Quick extract - simplified function for common use cases
 * Returns features with lat/lng for point layers
 */
export async function quickExtract(
  url: string,
  where?: string,
  maxFeatures: number = 100
): Promise<Array<{
  id: number | string;
  lat?: number;
  lng?: number;
  properties: Record<string, unknown>;
}>> {
  const geojson = await extractLayer(url, {
    where,
    maxFeatures,
    outSR: 4326
  });

  return geojson.features.map(f => {
    let lat: number | undefined;
    let lng: number | undefined;

    if (f.geometry && f.geometry.type === 'Point') {
      lng = f.geometry.coordinates[0];
      lat = f.geometry.coordinates[1];
    }

    return {
      id: f.id || 0,
      lat,
      lng,
      properties: f.properties
    };
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR INFRASTRUCTURE MONITORING
// ============================================================================

/**
 * Fetch current weather alerts for a bounding box
 */
export async function getWeatherAlerts(
  bbox?: [number, number, number, number]
): Promise<GeoJSONFeatureCollection> {
  return extractLayer(POPULAR_ESRI_SERVICES.weatherWarnings.url, {
    bbox,
    maxFeatures: 500
  });
}

/**
 * Fetch active wildfires
 */
export async function getActiveWildfires(
  bbox?: [number, number, number, number]
): Promise<GeoJSONFeatureCollection> {
  return extractLayer(POPULAR_ESRI_SERVICES.currentWildfires.url, {
    bbox,
    maxFeatures: 200
  });
}

/**
 * Fetch air quality data
 */
export async function getAirQualityData(
  bbox?: [number, number, number, number]
): Promise<GeoJSONFeatureCollection> {
  return extractLayer(POPULAR_ESRI_SERVICES.airQuality.url, {
    bbox,
    maxFeatures: 100
  });
}

/**
 * Fetch storm reports from last 24 hours
 */
export async function getStormReports(
  bbox?: [number, number, number, number]
): Promise<GeoJSONFeatureCollection> {
  return extractLayer(POPULAR_ESRI_SERVICES.stormReports.url, {
    bbox,
    maxFeatures: 500
  });
}

/**
 * Fetch power plant locations
 */
export async function getPowerPlants(
  bbox?: [number, number, number, number],
  fuelType?: string
): Promise<GeoJSONFeatureCollection> {
  const where = fuelType ? `Fuel = '${fuelType}'` : '1=1';
  return extractLayer(POPULAR_ESRI_SERVICES.powerPlants.url, {
    where,
    bbox,
    maxFeatures: 500
  });
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  // Core functions (ezesri equivalents)
  getLayerMetadata,
  summarizeMetadata,
  extractLayer,
  getServiceInfo,
  getFeatureCount,
  quickExtract,
  
  // Convenience functions
  getWeatherAlerts,
  getActiveWildfires,
  getAirQualityData,
  getStormReports,
  getPowerPlants,
  
  // Popular services catalog
  POPULAR_ESRI_SERVICES
};
