// Print face bounding boxes for each image path using macOS Vision (one JSON object per line).
// Boxes are in pixels of the EXIF-oriented image, origin top-left: [x, y, w, h, confidence].
// Build: swiftc -O -o pipeline/.bin/face_boxes pipeline/face_boxes.swift
import Foundation
import ImageIO
import Vision

func orientation(_ src: CGImageSource) -> CGImagePropertyOrientation {
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = props?[kCGImagePropertyOrientation] as? UInt32 ?? 1
    return CGImagePropertyOrientation(rawValue: raw) ?? .up
}

for path in CommandLine.arguments.dropFirst() {
    var out: [String: Any] = ["path": path]
    let url = URL(fileURLWithPath: path)
    if let src = CGImageSourceCreateWithURL(url as CFURL, nil),
       let img = CGImageSourceCreateImageAtIndex(src, 0, nil) {
        let ori = orientation(src)
        let swap = [.left, .right, .leftMirrored, .rightMirrored].contains(ori)
        let w = Double(swap ? img.height : img.width), h = Double(swap ? img.width : img.height)
        let req = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: img, orientation: ori, options: [:])
        do {
            try handler.perform([req])
            let faces = (req.results ?? []).map { f -> [Double] in
                let b = f.boundingBox
                return [b.minX * w, (1 - b.maxY) * h, b.width * w, b.height * h, Double(f.confidence)]
            }
            out["w"] = w; out["h"] = h; out["faces"] = faces
        } catch {
            out["error"] = "\(error)"
        }
    } else {
        out["error"] = "cannot read image"
    }
    let data = try! JSONSerialization.data(withJSONObject: out)
    print(String(data: data, encoding: .utf8)!)
}
