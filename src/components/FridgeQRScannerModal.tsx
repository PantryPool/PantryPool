import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { X, Upload, QrCode, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, Monitor } from 'lucide-react';
import { Pool, Item } from '../types';

interface FridgeQRScannerModalProps {
  pools: Pool[];
  activePool: Pool;
  items: Item[];
  onClose: () => void;
  onScanPoolCode: (code: string) => void;
  onScanItem: (item: Item) => void;
  onOpenKiosk: () => void;
  kioskModeEnabled?: boolean;
}

export const FridgeQRScannerModal: React.FC<FridgeQRScannerModalProps> = ({
  pools,
  activePool,
  items,
  onClose,
  onScanPoolCode,
  onScanItem,
  onOpenKiosk,
  kioskModeEnabled = true,
}) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [manualCode, setManualCode] = useState('');
  const [scannedResult, setScannedResult] = useState<{ type: 'pool' | 'item' | 'kiosk'; text: string; name?: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize camera stream
  useEffect(() => {
    let isMounted = true;

    async function startCamera() {
      try {
        setCameraError(null);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        const constraints = {
          video: {
            facingMode: cameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMounted) return;

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); // required for iOS
          await videoRef.current.play();
          scanFrame();
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Camera access error:', err);
        setCameraError('Camera access denied or unavailable on this device. You can use image upload or enter the code manually below.');
      }
    }

    if (scanning) {
      startCamera();
    }

    return () => {
      isMounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraFacing, scanning]);

  // Frame scanning loop using jsQR
  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        handleDecodedCode(code.data);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  // Decode QR string payload
  const handleDecodedCode = (dataString: string) => {
    const raw = dataString.trim();
    const upper = raw.toUpperCase();

    // Check if it's an Item Tag
    const itemMatch = items.find(
      (it) =>
        upper.includes(`PANTRY-${it.id.toUpperCase()}`) ||
        upper.includes(it.id.toUpperCase()) ||
        raw.includes(it.id) ||
        upper.includes(it.name.toUpperCase())
    );

    if (itemMatch) {
      setScanning(false);
      setScannedResult({ type: 'item', text: raw, name: itemMatch.name });
      setTimeout(() => {
        onScanItem(itemMatch);
        onClose();
      }, 1200);
      return;
    }

    // Check if it's Kiosk / Fridge Poster QR
    if (kioskModeEnabled && (upper.includes('FRIDGE') || upper.includes('KIOSK'))) {
      setScanning(false);
      setScannedResult({ type: 'kiosk', text: raw, name: `${activePool.name} Fridge Kiosk` });
      setTimeout(() => {
        onOpenKiosk();
        onClose();
      }, 1200);
      return;
    }

    // Check if it's a Pool Join Code
    const poolMatch = pools.find(
      (p) =>
        (p.code && upper.includes(p.code.toUpperCase())) ||
        ((p as any).qrCodeKey && upper.includes(String((p as any).qrCodeKey).toUpperCase())) ||
        ((p as any).qr_code_key && upper.includes(String((p as any).qr_code_key).toUpperCase())) ||
        raw.includes(p.id) ||
        upper.includes(p.name.toUpperCase())
    );

    if (poolMatch) {
      const matchedCode = poolMatch.code || (poolMatch as any).qrCodeKey || (poolMatch as any).qr_code_key || poolMatch.id;
      setScanning(false);
      setScannedResult({ type: 'pool', text: matchedCode, name: poolMatch.name });
      setTimeout(() => {
        onScanPoolCode(matchedCode);
        onClose();
      }, 1200);
      return;
    }

    // Generic pool code string
    if (upper.length >= 4 && upper.length <= 10) {
      setScanning(false);
      setScannedResult({ type: 'pool', text: upper, name: `Pool Code ${upper}` });
      setTimeout(() => {
        onScanPoolCode(upper);
        onClose();
      }, 1200);
      return;
    }
  };

  // Handle uploaded image file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleDecodedCode(code.data);
          } else {
            setCameraError('No QR code detected in this photo. Try taking a closer picture of the fridge QR tag.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedCode(manualCode);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-md w-full p-5 sm:p-6 text-[#2D2D2D] shadow-xl relative my-auto space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">Fridge & Pantry Scanner</h2>
              <p className="text-xs text-[#6B6B6B]">Scan QR codes on fridges, shelves, or items</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Camera Viewfinder Box */}
        <div className="relative rounded-lg overflow-hidden bg-[#2D2D2D] border border-[#E0DAD1] aspect-square flex flex-col items-center justify-center shadow-inner">
          <canvas ref={canvasRef} className="hidden" />

          {scannedResult ? (
            <div className="p-6 text-center space-y-3 animate-in zoom-in-95 duration-200 text-white">
              <div className="h-14 w-14 mx-auto rounded-full bg-[#EDF5EF] text-[#5A9A6B] flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[#5A9A6B] block">
                  QR Code Detected!
                </span>
                <h3 className="text-lg font-semibold text-white mt-0.5">{scannedResult.name}</h3>
                <p className="text-xs text-[#9A9A9A] font-mono-financial mt-1">{scannedResult.text}</p>
              </div>
              <p className="text-xs text-[#9A9A9A] animate-pulse">Loading experience...</p>
            </div>
          ) : cameraError ? (
            <div className="p-6 text-center space-y-3 text-white">
              <AlertCircle className="h-8 w-8 mx-auto text-[#D4870E]" />
              <p className="text-xs text-[#9A9A9A]">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Viewfinder Target Box Overlay */}
              <div className="relative z-10 w-3/4 aspect-square border-2 border-dashed border-[#E8694A] rounded-2xl flex flex-col items-center justify-between p-3 bg-[#E8694A]/10">
                <div className="w-full flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-[#E8694A] rounded-tl" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-[#E8694A] rounded-tr" />
                </div>
                <div className="text-[11px] font-medium text-white bg-[#2D2D2D]/90 px-3 py-1 rounded-full border border-[#E0DAD1]">
                  Point camera at Fridge QR Tag
                </div>
                <div className="w-full flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-[#E8694A] rounded-bl" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-[#E8694A] rounded-br" />
                </div>
              </div>

              {/* Camera Switcher Button */}
              <button
                type="button"
                onClick={() => setCameraFacing(cameraFacing === 'environment' ? 'user' : 'environment')}
                className="absolute bottom-3 right-3 z-20 p-2 rounded-md bg-[#2D2D2D]/80 border border-white/20 text-white hover:bg-[#2D2D2D] transition"
                title="Switch Camera"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Alternative Input Methods */}
        <div className="space-y-3">
          
          {/* File Upload & Kiosk Button */}
          <div className="flex gap-2">
            <label className="flex-1 py-2 px-3 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] border border-[#E0DAD1] text-[#2D2D2D] text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload className="h-4 w-4 text-[#E8694A]" />
              <span>Upload QR Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {kioskModeEnabled && (
              <button
                type="button"
                onClick={() => {
                  onOpenKiosk();
                  onClose();
                }}
                className="py-2 px-4 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <Monitor className="h-4 w-4" />
                <span>Fridge Kiosk</span>
              </button>
            )}
          </div>


          {/* Manual Code Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Or enter Code e.g. PNTR4F"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] uppercase font-mono-financial"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center gap-1 transition shadow-xs"
            >
              <span>Submit</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>

        </div>

      </div>
    </div>
  );
};
