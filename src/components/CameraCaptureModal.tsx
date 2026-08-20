import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, RefreshCw, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { compressCameraPhoto } from '../lib/imageUtils';
import { useBackButton } from '../lib/backButtonHandler';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (attachment: { id: string; name: string; data: string; type: string; size: number }) => void;
}

export function CameraCaptureModal({ isOpen, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useBackButton('camera-capture-modal', isOpen, () => {
    if (capturedPhoto) {
      setCapturedPhoto(null);
    } else {
      onClose();
    }
  }, 100);

  // Start video stream when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCapturedPhoto(null);
      setErrorMsg(null);
      return;
    }

    startCamera();

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startCamera = async () => {
    stopStream();
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera access is not supported on this browser or device. You can use the fallback file selector.');
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Unable to access camera directly:', err);
      setErrorMsg(
        'Could not access camera. Please check camera permissions or use your device file picker below.'
      );
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
    }
  };

  const handleConfirmPhoto = async () => {
    if (!capturedPhoto) return;
    setIsProcessing(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const fileName = `Photo_${timestamp}.jpg`;

      const compressed = await compressCameraPhoto(capturedPhoto, fileName);
      onCapture({
        id: `cam-${Math.random().toString(36).substring(2, 9)}`,
        name: compressed.name,
        data: compressed.data,
        type: 'image',
        size: compressed.size,
      });
      onClose();
    } catch (err) {
      console.error('Failed to compress camera photo:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNativeFileFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawData = event.target?.result as string;
        if (rawData) {
          const compressed = await compressCameraPhoto(rawData, file.name || 'Camera_Photo.jpg');
          onCapture({
            id: `cam-${Math.random().toString(36).substring(2, 9)}`,
            name: compressed.name,
            data: compressed.data,
            type: 'image',
            size: compressed.size,
          });
          onClose();
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed fallback camera pick:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md text-left animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-lg w-full shadow-2xl relative flex flex-col space-y-4 max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Capture Photo</h3>
              <p className="text-xs text-slate-400">Takes camera snapshot & auto-compresses under 500KB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hidden fallback file input for mobile camera trigger */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleNativeFileFallback}
        />

        {/* Viewfinder / Preview */}
        <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
          {capturedPhoto ? (
            <img src={capturedPhoto} alt="Captured preview" className="w-full h-full object-contain" />
          ) : stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300 max-w-xs">{errorMsg || 'Initializing camera...'}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition inline-flex items-center space-x-2 cursor-pointer shadow-md"
              >
                <ImageIcon className="h-4 w-4" />
                <span>Open Device Camera / Photos</span>
              </button>
            </div>
          )}

          {/* Camera Controls Overlay when active */}
          {stream && !capturedPhoto && (
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center space-x-6 px-4">
              <button
                type="button"
                onClick={flipCamera}
                title="Flip Camera"
                className="p-3 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full backdrop-blur-md transition cursor-pointer border border-slate-700"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={takeSnapshot}
                title="Take Photo"
                className="p-4 bg-white hover:bg-slate-200 text-slate-900 rounded-full shadow-xl transition cursor-pointer transform active:scale-95 border-4 border-indigo-500"
              >
                <Camera className="h-7 w-7 text-indigo-600" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Choose file instead"
                className="p-3 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full backdrop-blur-md transition cursor-pointer border border-slate-700"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          {capturedPhoto ? (
            <div className="flex items-center justify-between w-full space-x-3">
              <button
                type="button"
                onClick={() => setCapturedPhoto(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmPhoto}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-md disabled:opacity-50"
              >
                {isProcessing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>Use Photo & Attach</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
