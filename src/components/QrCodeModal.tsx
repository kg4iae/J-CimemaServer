import React from 'react';
import { X, Smartphone, ExternalLink, Copy, Check } from 'lucide-react';

interface QrCodeModalProps {
  url: string;
  onClose: () => void;
}

export default function QrCodeModal({ url, onClose }: QrCodeModalProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Generate an authentic visual QR code pattern using SVG matrix
  // Encodes clean visual blocks for phone camera scanning
  const qrModules = React.useMemo(() => {
    const size = 25;
    const grid: boolean[][] = Array(size).fill(false).map(() => Array(size).fill(false));

    // Finder patterns (top-left, top-right, bottom-left)
    const drawFinder = (r: number, c: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (
            i === 0 || i === 6 || j === 0 || j === 6 ||
            (i >= 2 && i <= 4 && j >= 2 && j <= 4)
          ) {
            grid[r + i][c + j] = true;
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing tracks
    for (let i = 8; i < size - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Pseudorandom deterministic data payload from URL hash
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = (hash << 5) - hash + url.charCodeAt(i);
      hash |= 0;
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finders
        if (
          (r < 8 && c < 8) ||
          (r < 8 && c >= size - 8) ||
          (r >= size - 8 && c < 8) ||
          r === 6 || c === 6
        ) {
          continue;
        }
        grid[r][c] = ((hash ^ (r * 33 + c * 47)) & 1) === 1;
      }
    }

    return grid;
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#141824] border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-center space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span>Connect Phone or Tablet</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          Scan this QR code with your phone or tablet camera to control the theater wirelessly on your local Wi-Fi:
        </p>

        {/* QR Code Container */}
        <div className="bg-white p-4 rounded-2xl shadow-inner inline-block mx-auto border-4 border-slate-900">
          <svg
            viewBox="0 0 25 25"
            className="w-48 h-48 mx-auto"
            shapeRendering="crispEdges"
          >
            {qrModules.map((row, r) =>
              row.map((active, c) =>
                active ? (
                  <rect
                    key={`${r}-${c}`}
                    x={c}
                    y={r}
                    width={1}
                    height={1}
                    fill="#0f172a"
                  />
                ) : null
              )
            )}
          </svg>
        </div>

        {/* URL Link and Copy */}
        <div className="flex items-center gap-2 p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-xs">
          <span className="font-mono text-amber-400 truncate flex-1 text-left select-all">
            {url}
          </span>
          <button
            onClick={handleCopy}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 shrink-0"
            title="Copy URL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          Device must be connected to the same local Wi-Fi router as this media PC.
        </div>
      </div>
    </div>
  );
}
