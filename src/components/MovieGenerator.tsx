import { useState, useEffect, useMemo } from 'react'
import type { FrameData, DrawingLayer } from '../types'

interface MovieGeneratorProps {
  frames: FrameData[]
  onClose: () => void
  onGenerate: (layerSettings: Record<string, boolean>) => void
}

export function MovieGenerator({ frames, onClose, onGenerate }: MovieGeneratorProps) {
  const [layerSettings, setLayerSettings] = useState<Record<string, boolean>>({})
  const [applyCurrentSettings, setApplyCurrentSettings] = useState(false)

  // Get all unique layers by name across all frames
  const allLayers = useMemo(() => {
    const uniqueLayers: DrawingLayer[] = []
    const seenNames = new Set<string>()
    
    frames.forEach(frame => {
      frame.layers.forEach(layer => {
        if (!seenNames.has(layer.name)) {
          uniqueLayers.push(layer)
          seenNames.add(layer.name)
        }
      })
    })
    
    return uniqueLayers
  }, [frames])

  // Initialize layer settings when component mounts or frames change
  useEffect(() => {
    const settings: Record<string, boolean> = {}
    allLayers.forEach(layer => {
      settings[layer.name] = layer.visible
    })
    setLayerSettings(settings)
  }, [allLayers])

  const handleLayerToggle = (layerName: string) => {
    setLayerSettings(prev => ({
      ...prev,
      [layerName]: !prev[layerName]
    }))
  }

  const handleGenerate = () => {
    if (applyCurrentSettings) {
      // Use current frame's layer settings
      const currentSettings: Record<string, boolean> = {}
      if (frames.length > 0) {
        frames[0].layers.forEach(layer => {
          currentSettings[layer.name] = layer.visible
        })
      }
      onGenerate(currentSettings)
    } else {
      onGenerate(layerSettings)
    }
  }

  return (
    <div className="dialog-overlay">
      <div className="confirm-dialog" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Generate Movie</h3>
          <button 
            type="button" 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px'
            }}
          >
            ×
          </button>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
            <input
              type="checkbox"
              checked={applyCurrentSettings}
              onChange={(e) => setApplyCurrentSettings(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Apply current layer settings to all frames
          </label>

          {!applyCurrentSettings && (
            <div>
              <h4 style={{ marginBottom: '10px' }}>Select layers to include in movie:</h4>
              {allLayers.map(layer => (
                <label key={layer.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={layerSettings[layer.name] || false}
                    onChange={() => handleLayerToggle(layer.name)}
                    style={{ marginRight: '8px' }}
                  />
                  <span>{layer.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleGenerate}>
            Generate Movie
          </button>
        </div>
      </div>
    </div>
  )
}
