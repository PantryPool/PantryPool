import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { 
  X, 
  Camera, 
  RefreshCw, 
  Zap, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Barcode, 
  ScanLine,
  ArrowRight,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface UpcScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
}

export const UpcScannerModal: React.FC<UpcScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Product Barcode / UPC',
  subtitle = 'Point camera at any retail UPC, barcode, or QR code'
}) => {
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Play a soft pleasant scanner beep
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {}

    try {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch {}
  };

  const handleBarcodeFound = (rawText: string) => {
    const clean = rawText.trim().replace(/[^0-9A-Za-z_-]/g, '');
    if (!clean) return;

    setIsScanning(false);
    setScannedCode(clean);
    playBeep();

    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }

    setTimeout(() => {
      onScan(clean);
      onClose();
    }, 500);
  };

  // Start continuous barcode scanner
  useEffect(() => {
    if (!isOpen || !isScanning) return;
    let isCancelled = false;

    async function initScanner() {
      try {
        setCameraError(null);
        setTorchSupported(false);
        setTorchOn(false);

        // Stop prior controls if active
        if (controlsRef.current) {
          controlsRef.current.stop();
          controlsRef.current = null;
        }

        // Configure hints to prioritize 1D retail UPC/EAN formats and QR
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
        readerRef.current = reader;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Camera access is not supported in this browser or environment. You can upload an image or type the UPC below.');
          return;
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: cameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        if (!videoRef.current) return;

        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result, error) => {
            if (isCancelled) return;
            if (result && result.getText()) {
              handleBarcodeFound(result.getText());
            }
          }
        );

        if (isCancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;

        // Check torch support
        try {
          const stream = videoRef.current?.srcObject as MediaStream;
          if (stream) {
            streamRef.current = stream;
            const track = stream.getVideoTracks()[0];
            const caps = (track as any)?.getCapabilities?.();
            if (caps && 'torch' in caps) {
              setTorchSupported(true);
            }
          }
        } catch {}

      } catch (err: any) {
        if (isCancelled) return;
        console.warn('[UPC Scanner Camera Error]', err);
        setCameraError('Camera access denied or unavailable. You can upload an image or type the UPC below.');
      }
    }

    initScanner();

    return () => {
      isCancelled = true;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, cameraFacing, isScanning]);

  const toggleTorch = async () => {
    try {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];
      const nextTorch = !torchOn;
      await (track as any)?.applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  const handleFlipCamera = () => {
    setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Decode barcode from image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const hints = new Map<DecodeHintType, any>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints);
          const result = await reader.decodeFromImageElement(img);
          if (result && result.getText()) {
            handleBarcodeFound(result.getText());
          } else {
            setCameraError('No barcode detected in this photo. Try a clear, straight-on picture of the UPC.');
          }
        } catch (decodeErr) {
          setCameraError('Could not decode barcode from image. Please ensure the UPC numbers are visible.');
        }
      };
      img.src = event.target?.result as string;
    };
    fileReader.readAsDataURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeFound(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-md w-full p-5 sm:p-6 text-[#2D2D2D] shadow-2xl relative my-auto space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
              <Barcode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#2D2D2D]">{title}</h2>
              <p className="text-[11px] text-[#6B6B6B]">{subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
            aria-label="Close Scanner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder Viewport */}
        <div className="relative rounded-xl overflow-hidden bg-black border border-[#E0DAD1] aspect-4/3 flex flex-col items-center justify-center shadow-inner group">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Success Overlay */}
          {scannedCode ? (
            <div className="absolute inset-0 bg-[#2D2D2D]/85 flex flex-col items-center justify-center p-6 text-center text-white space-y-2 animate-in zoom-in-95 duration-150">
              <div className="h-12 w-12 rounded-full bg-[#EDF5EF] text-[#437A65] flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <span className="text-xs font-semibold text-[#5A9A6B]">UPC / Barcode Detected!</span>
              <span className="font-mono text-sm bg-white/10 px-3 py-1 rounded-md border border-white/20">
                {scannedCode}
              </span>
              <p className="text-[10px] text-white/70">Auto-filling product details...</p>
            </div>
          ) : (
            <>
              {/* Barcode Targeting Box Reticle */}
              <div className="absolute inset-x-8 sm:inset-x-12 inset-y-12 sm:inset-y-16 border-2 border-white/40 rounded-lg pointer-events-none flex items-center justify-center shadow-2xl">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-[#E8694A]" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-[#E8694A]" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-[#E8694A]" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-[#E8694A]" />

                {/* Animated Laser Scanning Line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#E8694A] to-transparent shadow-[0_0_8px_#E8694A] animate-pulse" />
              </div>

              {/* Instructions Pill */}
              <div className="absolute bottom-3 px-3 py-1 bg-black/65 backdrop-blur-xs rounded-full text-[10px] text-white/90 font-medium flex items-center gap-1.5 pointer-events-none">
                <ScanLine className="w-3 h-3 text-[#E8694A] animate-pulse" />
                Align barcode within the target frame
              </div>
            </>
          )}

          {/* Quick Controls on Camera Overlay */}
          {!scannedCode && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-full backdrop-blur-xs transition cursor-pointer ${
                    torchOn ? 'bg-[#E8694A] text-white' : 'bg-black/50 text-white hover:bg-black/70'
                  }`}
                  title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleFlipCamera}
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur-xs transition cursor-pointer"
                title="Flip Camera (Front / Back)"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Camera Error / Warning Banner */}
        {cameraError && (
          <div className="p-3 bg-[#FDF0EC] border border-[#F5C2B4] rounded-lg text-xs text-[#E8694A] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] leading-relaxed">
              <span>{cameraError}</span>
            </div>
          </div>
        )}

        {/* Alternative Actions: Image Upload & Fast Samples */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs">
            <label className="text-[11px] font-medium text-[#6B6B6B] flex items-center gap-1">
              <span>Or choose an image photo</span>
            </label>
            <label className="px-2.5 py-1 bg-[#F0EBE3] hover:bg-[#E5DFD6] text-[#2D2D2D] rounded-md text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition">
              <Upload className="w-3 h-3 text-[#E8694A]" />
              <span>Upload Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Quick Test Samples */}
          <div>
            <div className="text-[10px] text-[#8A8A8A] font-medium mb-1.5 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#E8694A]" />
              Quick Sample UPCs (Click to test):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: 'Coke 12oz', upc: '049000028904' },
                { name: 'Red Bull', upc: '611269001007' },
                { name: 'LaCroix', upc: '012000001291' },
                { name: 'KIND Bar', upc: '602652171804' },
              ].map((sample) => (
                <button
                  key={sample.upc}
                  type="button"
                  onClick={() => handleBarcodeFound(sample.upc)}
                  className="px-2 py-1 bg-[#FAF9F5] hover:bg-[#F0EBE3] border border-[#E0DAD1] hover:border-[#E8694A] text-[#2D2D2D] text-[10px] rounded font-mono transition flex items-center gap-1 cursor-pointer"
                >
                  <span className="font-sans font-medium text-[#6B6B6B]">{sample.name}:</span>
                  <span>{sample.upc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1 border-t border-[#EDE8E0]">
            <input
              type="text"
              placeholder="Or type UPC number manually (e.g. 012000001291)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md px-3 py-2 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] font-mono"
            />
            <button
              type="submit"
              disabled={manualCode.trim().length < 4}
              className="px-3 py-2 bg-[#E8694A] hover:bg-[#D45A3D] disabled:opacity-50 text-white text-xs font-semibold rounded-md flex items-center gap-1 transition cursor-pointer shadow-xs"
            >
              <span>Apply</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Open Food Facts Legal & ODbL Attribution */}
          <div className="pt-2 text-[10px] text-[#8A8A8A] flex flex-wrap items-center justify-between gap-2 border-t border-[#EDE8E0]/70">
            <span>
              Product data via{' '}
              <a
                href="https://world.openfoodfacts.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8694A] hover:underline font-medium"
              >
                Open Food Facts
              </a>{' '}
              (<a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8694A] hover:underline"
              >
                ODbL
              </a>)
            </span>
            <a
              href={manualCode.trim() ? `https://world.openfoodfacts.org/cgi/product.pl?type=edit&code=${encodeURIComponent(manualCode.trim().replace(/[^0-9]/g, ''))}` : 'https://world.openfoodfacts.org/cgi/product.pl?type=edit'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#5A9A6B] hover:underline font-medium flex items-center gap-1"
            >
              <span>+ Contribute Product</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
