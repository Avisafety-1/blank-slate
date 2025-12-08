import JSZip from 'jszip';

interface RouteCoordinate {
  lat: number;
  lng: number;
}

interface RouteData {
  coordinates: RouteCoordinate[];
  totalDistance: number;
}

const generateTemplateKml = (missionName: string, route: RouteData, flightHeight: number): string => {
  const timestamp = new Date().toISOString();
  
  const placemarks = route.coordinates.map((coord, index) => `
      <Placemark>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${flightHeight}</wpml:executeHeight>
        <wpml:waypointSpeed>5</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <Point>
          <coordinates>${coord.lng},${coord.lat}</coordinates>
        </Point>
      </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Avisafe</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${Math.round(route.totalDistance)}</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>5</wpml:autoFlightSpeed>
      <name>${missionName}</name>
${placemarks}
    </Folder>
  </Document>
</kml>`;
};

const generateWaylinesWpml = (route: RouteData, flightHeight: number): string => {
  const timestamp = new Date().toISOString();
  
  const placemarks = route.coordinates.map((coord, index) => `
      <Placemark>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${flightHeight}</wpml:executeHeight>
        <wpml:waypointSpeed>5</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <Point>
          <coordinates>${coord.lng},${coord.lat}</coordinates>
        </Point>
      </Placemark>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>Avisafe</wpml:author>
    <wpml:createTime>${timestamp}</wpml:createTime>
    <wpml:updateTime>${timestamp}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${Math.round(route.totalDistance)}</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>5</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>`;
};

export const generateDJIKMZ = async (
  missionName: string,
  route: RouteData,
  flightHeight: number = 50
): Promise<Blob> => {
  const zip = new JSZip();
  const wpmzFolder = zip.folder('wpmz');
  
  if (!wpmzFolder) {
    throw new Error('Failed to create wpmz folder');
  }
  
  // Generate template.kml with DJI WPML format
  const templateKml = generateTemplateKml(missionName, route, flightHeight);
  wpmzFolder.file('template.kml', templateKml);
  
  // Generate waylines.wpml
  const waylinesWpml = generateWaylinesWpml(route, flightHeight);
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
