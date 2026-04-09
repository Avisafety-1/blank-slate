import JSZip from 'jszip';

interface RouteCoordinate {
  lat: number;
  lng: number;
}

interface RouteData {
  coordinates: RouteCoordinate[];
  totalDistance: number;
}

export interface DJIExportOptions {
  takeOffHeight?: number;       // 1.2–1500m, default 20
  heightMode?: 'relativeToStartPoint' | 'EGM96'; // default relativeToStartPoint
  speed?: number;               // 1–15 m/s, default 5
  turnMode?: 'toPointAndStopWithDiscontinuityCurvature' | 'toPointAndPassWithContinuityCurvature'; // default stop
}

const generateTemplateKml = (
  missionName: string,
  route: RouteData,
  flightHeight: number,
  opts: DJIExportOptions = {}
): string => {
  const timestamp = Date.now();
  const speed = opts.speed ?? 5;
  const takeOffHeight = opts.takeOffHeight ?? 20;
  const heightMode = opts.heightMode ?? 'relativeToStartPoint';
  const turnMode = opts.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature';

  const placemarks = route.coordinates.map((coord, index) => `
      <Placemark>
        <Point>
          <coordinates>
            ${coord.lng},${coord.lat}
          </coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:ellipsoidHeight>0</wpml:ellipsoidHeight>
        <wpml:height>${flightHeight}</wpml:height>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0.2</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useGlobalHeight>1</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>
        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
        <wpml:isRisky>0</wpml:isRisky>
      </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:author>Avisafe</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${takeOffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${takeOffHeight}</wpml:globalRTHHeight>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${heightMode}</wpml:heightMode>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
      <wpml:globalHeight>${flightHeight}</wpml:globalHeight>
      <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
      <wpml:gimbalPitchMode>manual</wpml:gimbalPitchMode>
      <wpml:globalWaypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>${turnMode}</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
${placemarks}
    </Folder>
  </Document>
</kml>`;
};

const generateWaylinesWpml = (
  route: RouteData,
  flightHeight: number,
  opts: DJIExportOptions = {}
): string => {
  const speed = opts.speed ?? 5;
  const takeOffHeight = opts.takeOffHeight ?? 20;
  const turnMode = opts.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature';

  const placemarks = route.coordinates.map((coord, index) => `
      <Placemark>
        <Point>
          <coordinates>
            ${coord.lng},${coord.lat}
          </coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${flightHeight}</wpml:executeHeight>
        <wpml:waypointSpeed>${speed}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
        <wpml:isRisky>0</wpml:isRisky>
        <wpml:waypointWorkType>0</wpml:waypointWorkType>
      </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${takeOffHeight}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${speed}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${takeOffHeight}</wpml:globalRTHHeight>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${route.totalDistance.toFixed(1)}</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${speed}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>`;
};

export const generateDJIKMZ = async (
  missionName: string,
  route: RouteData,
  flightHeight: number = 50,
  opts: DJIExportOptions = {}
): Promise<Blob> => {
  const zip = new JSZip();
  const wpmzFolder = zip.folder('wpmz');
  
  if (!wpmzFolder) {
    throw new Error('Failed to create wpmz folder');
  }
  
  const templateKml = generateTemplateKml(missionName, route, flightHeight, opts);
  wpmzFolder.file('template.kml', templateKml);
  
  const waylinesWpml = generateWaylinesWpml(route, flightHeight, opts);
  wpmzFolder.file('waylines.wpml', waylinesWpml);
  
  return await zip.generateAsync({ type: 'blob' });
};

export const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[åÅ]/g, 'a')
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};
