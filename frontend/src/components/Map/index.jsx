/**
 * components/Map/index.jsx
 *
 * Leaflet map shell.
 * Owns only the tile layer and viewport configuration.
 * Canvas drawing is delegated to CanvasLayer.
 */

import { MapContainer, TileLayer } from 'react-leaflet'
import CanvasLayer from './CanvasLayer'
import { SIM_CFG } from '../../config/simulation'

export default function MapView({ segments, tractor }) {
  return (
    <MapContainer
      center={[SIM_CFG.startLat, SIM_CFG.startLon]}
      zoom={18}
      className="map"
      zoomControl
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Imagery © Esri"
        maxZoom={20}
      />
      <CanvasLayer segments={segments} tractor={tractor} />
    </MapContainer>
  )
}
