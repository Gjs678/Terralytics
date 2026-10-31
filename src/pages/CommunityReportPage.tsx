import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/shared/Brand';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { Camera, MapPin, Calendar, Clock, House, UploadCloud, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { mossamApi } from '../services/api';

export const CommunityReportPage: React.FC = () => {
  useDocumentTitle('Report a Hazard');
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [type, setType] = useState('landslide');
  const [severity, setSeverity] = useState('high');
  const [locationText, setLocationText] = useState('NH-27, Sonapur (Assam)');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Approximate coordinate lookup based on location text
    let lat = 26.1158;
    let lng = 91.7026;
    if (locationText.toLowerCase().includes('sonapur')) {
      lat = 26.1200;
      lng = 91.9800;
    } else if (locationText.toLowerCase().includes('shillong')) {
      lat = 25.5788;
      lng = 91.8933;
    } else if (locationText.toLowerCase().includes('itanagar')) {
      lat = 27.0844;
      lng = 93.6053;
    }

    try {
      const response = await mossamApi.submitBlockageReport({
        type,
        severity,
        lat,
        lng,
        description: `${description || `Community reported ${severity} ${type.replace('_', ' ')}`} (Location: ${locationText})`,
      });
      setSubmittedData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to submit report to backend');
    } finally {
      setLoading(false);
    }
  };

  if (submittedData) {
    const rep = submittedData.report;
    const inc = submittedData.incident_response?.incident;
    return (
      <div className="min-h-screen bg-monsoon-50 flex flex-col items-center justify-center p-6 text-monsoon-900 animate-fade-in">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center border border-monsoon-100">
          <CheckCircle size={64} className="text-moss-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold font-heading mb-2 text-monsoon-900">Report Persisted to Control Room</h2>
          <p className="text-monsoon-600 mb-4 text-sm leading-relaxed">
            Your field report has been verified and registered in the active logistics pipeline.
          </p>

          <div className="bg-monsoon-50 p-4 rounded-lg mb-6 text-left text-xs space-y-1.5 border border-monsoon-200">
            <div className="flex justify-between">
              <span className="text-monsoon-600 font-medium">Report Reference:</span>
              <span className="font-mono font-bold text-monsoon-800">{rep.id}</span>
            </div>
            {inc && (
              <div className="flex justify-between">
                <span className="text-monsoon-600 font-medium">Incident ID:</span>
                <span className="font-mono font-bold text-terracotta-600">{inc.id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-monsoon-600 font-medium">Hazard Type:</span>
              <span className="capitalize font-semibold text-monsoon-800">{rep.type.replace('_', ' ')} ({rep.severity})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-monsoon-600 font-medium">GPS Coordinates:</span>
              <span className="font-mono text-monsoon-700">{rep.lat.toFixed(4)}, {rep.lng.toFixed(4)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link 
              to="/control-room"
              className="bg-moss-600 hover:bg-moss-500 text-white font-semibold py-3 px-6 rounded-md transition-all shadow-md inline-block w-full text-sm"
            >
              View on Control Room Map
            </Link>
            <button 
              onClick={() => { setSubmittedData(null); setDescription(''); }}
              className="bg-monsoon-100 hover:bg-monsoon-200 text-monsoon-700 font-semibold py-2.5 px-6 rounded-md transition-all text-xs"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-monsoon-50 flex flex-col items-center p-6 text-monsoon-900 relative">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between pt-2 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md border border-monsoon-200 bg-white px-3 py-1.5 text-sm font-medium text-monsoon-800 hover:bg-monsoon-100 transition-colors"
          >
            <House size={16} />
            Home
          </Link>
          <BrandLockup size={28} textClassName="text-monsoon-900" />
        </div>
        <h1 className="mb-6 text-2xl font-semibold font-heading text-monsoon-900">Community Disaster Report</h1>

        <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm border border-monsoon-100 animate-fade-in">
          
          <div className="mb-6 bg-terracotta-50 p-4 rounded-md flex items-start gap-3 border border-terracotta-100">
            <AlertCircle size={24} className="text-terracotta-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-terracotta-800">
              This report connects directly to the TERRALYTICS disaster response pipeline. Verified hazards automatically notify approaching logistics trucks to divert.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Hazard Type and Severity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Hazard Category *</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full py-3 px-3 bg-monsoon-50 border border-monsoon-200 rounded-md text-monsoon-900 font-medium text-sm outline-none focus:border-moss-500"
                >
                  <option value="landslide">Landslide / Rockfall</option>
                  <option value="flood">Flash Flood / Inundation</option>
                  <option value="road_blockage">Road Blockage / Debris</option>
                  <option value="accident">Severe Vehicle Accident</option>
                  <option value="heavy_rainfall">Cloudburst / Extreme Rain</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Observed Severity *</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full py-3 px-3 bg-monsoon-50 border border-monsoon-200 rounded-md text-monsoon-900 font-medium text-sm outline-none focus:border-moss-500 capitalize"
                >
                  <option value="low">Low (Passable with caution)</option>
                  <option value="medium">Medium (Single lane blocked)</option>
                  <option value="high">High (Major delay / hazard)</option>
                  <option value="severe">Severe (Entire corridor impassable)</option>
                </select>
              </div>
            </div>

            {/* Photo Upload Simulation */}
            <div>
              <label className="block text-sm font-semibold text-monsoon-700 mb-2">Disaster Photo</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                  photoUploaded ? 'border-moss-500 bg-moss-50' : 'border-monsoon-300 hover:border-moss-400 bg-monsoon-50/50'
                }`}
                onClick={() => setPhotoUploaded(!photoUploaded)}
              >
                {photoUploaded ? (
                  <div className="flex flex-col items-center text-moss-600">
                    <CheckCircle size={36} className="mb-2" />
                    <span className="font-semibold text-sm">Site Evidence Photo Attached</span>
                    <span className="text-xs text-moss-500">Click to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-monsoon-600">
                    <div className="bg-white p-3 rounded-full shadow-sm mb-2">
                      <Camera size={24} className="text-moss-500" />
                    </div>
                    <span className="font-semibold text-monsoon-700 text-sm">Tap to attach photo</span>
                    <span className="text-xs">Supports geotagged validation</span>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Location Landmark / Highway *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <MapPin size={18} className="text-monsoon-400" />
                </div>
                <input
                  type="text"
                  required
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-monsoon-50 border border-monsoon-200 rounded-md focus:ring-2 focus:ring-moss-500/50 focus:border-moss-500 text-monsoon-900 text-sm outline-none font-medium"
                  placeholder="e.g. NH-27 near Sonapur or NH-13 Km 42"
                />
              </div>
            </div>

            {/* Date & Time Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Calendar size={18} className="text-monsoon-400" />
                  </div>
                  <input
                    type="date"
                    required
                    className="w-full pl-11 pr-4 py-3 bg-monsoon-50 border border-monsoon-200 rounded-md text-monsoon-900 text-sm outline-none font-medium"
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Time</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Clock size={18} className="text-monsoon-400" />
                  </div>
                  <input
                    type="time"
                    required
                    className="w-full pl-11 pr-4 py-3 bg-monsoon-50 border border-monsoon-200 rounded-md text-monsoon-900 text-sm outline-none font-medium"
                    defaultValue={new Date().toTimeString().slice(0,5)}
                  />
                </div>
              </div>
            </div>

            {/* Details */}
            <div>
              <label className="block text-sm font-semibold text-monsoon-700 mb-1.5">Observation Details</label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3.5 bg-monsoon-50 border border-monsoon-200 rounded-md focus:ring-2 focus:ring-moss-500/50 focus:border-moss-500 text-monsoon-900 text-sm outline-none font-medium resize-none"
                placeholder="Describe current road condition (e.g. Mudflow across 50 meters, water depth approx 2 feet, traffic halted)"
              ></textarea>
            </div>

            {error && (
              <div className="p-3 bg-terracotta-50 border border-terracotta-200 rounded-md text-xs text-terracotta-600">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-monsoon-900 hover:bg-monsoon-800 disabled:opacity-50 text-white font-semibold py-3.5 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Registering Incident...
                </>
              ) : (
                <>
                  <UploadCloud size={18} />
                  Submit Field Report
                </>
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};
