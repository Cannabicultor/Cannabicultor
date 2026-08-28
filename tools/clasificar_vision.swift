import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 3 else {
    fputs("Uso: clasificar_vision.swift <directorio-miniaturas> <salida.tsv>\n", stderr)
    exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let manager = FileManager.default
let files = try manager.contentsOfDirectory(
    at: input,
    includingPropertiesForKeys: nil,
    options: [.skipsHiddenFiles]
).filter { $0.pathExtension.lowercased() == "jpg" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

var lines = ["indice\tetiqueta_1\tconfianza_1\tetiqueta_2\tconfianza_2\tetiqueta_3\tconfianza_3"]
for file in files {
    autoreleasepool {
        guard let image = NSImage(contentsOf: file),
              let data = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: data),
              let cgImage = bitmap.cgImage else { return }
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            let results = (request.results ?? []).prefix(3)
            let index = file.deletingPathExtension().lastPathComponent
            var fields = [index]
            for result in results {
                fields.append(result.identifier.replacingOccurrences(of: "\t", with: " "))
                fields.append(String(format: "%.4f", result.confidence))
            }
            while fields.count < 7 { fields.append("") }
            lines.append(fields.joined(separator: "\t"))
        } catch {
            fputs("ERROR \(file.path): \(error)\n", stderr)
        }
    }
}
try lines.joined(separator: "\n").write(to: output, atomically: true, encoding: .utf8)
print("clasificadas=\(lines.count - 1)")
