import React, { useState } from "react";
import axios from "axios";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function App() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [blocksByPage, setBlocksByPage] = useState({});
  const [pageDims, setPageDims] = useState({});
  const [jsonResult, setJsonResult] = useState(null);
  const [highlighted, setHighlighted] = useState(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    // Upload to backend
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      console.log("Upload response:", res.data);
      setJobId(res.data.JobId);
      pollTextract(res.data.JobId);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  const pollTextract = async (jobId) => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://localhost:5000/results/${jobId}`);
        if (res.data.status === "SUCCEEDED") {
          clearInterval(interval);
          console.log("Textract result:", res.data);

          // group blocks by page
          const grouped = {};
          res.data.Blocks.forEach((block) => {
            if (block.BlockType === "WORD" || block.BlockType === "LINE") {
              const page = block.Page || 1;
              if (!grouped[page]) grouped[page] = [];
              grouped[page].push(block);
            }
          });

          setBlocksByPage(grouped);
          setJsonResult(res.data);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);
  };

  const handlePageRender = (pageNum, page) => {
    setPageDims((prev) => ({
      ...prev,
      [pageNum]: { width: page.width, height: page.height },
    }));
  };

  const getOverlayStyle = (bbox, pageNum, id) => {
    const dims = pageDims[pageNum];
    if (!dims) return {};

    return {
      position: "absolute",
      border: highlighted === id ? "2px solid yellow" : "1px solid red",
      backgroundColor:
        highlighted === id ? "rgba(255, 235, 59, 0.4)" : "transparent",
      left: bbox.Left * dims.width,
      top: bbox.Top * dims.height,
      width: bbox.Width * dims.width,
      height: bbox.Height * dims.height,
      pointerEvents: "none",
      boxSizing: "border-box",
      transition: "all 0.2s ease-in-out",
    };
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Left: PDF Viewer */}
      <div
        style={{
          flex: 1,
          minWidth: "50%",
          borderRight: "2px solid #333",
          overflowY: "auto",
          background: "#f8f9fa",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: file ? "flex-start" : "center",
          padding: "20px",
        }}
      >
        {!file ? (
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "80%",
              height: "200px",
              border: "2px dashed #666",
              borderRadius: "10px",
              cursor: "pointer",
              background: "#fff",
              color: "#444",
              transition: "0.3s",
            }}
          >
            <input
              type="file"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <p style={{ fontSize: "16px", fontWeight: "bold" }}>
              📄 Click to upload a PDF
            </p>
            <p style={{ fontSize: "13px", color: "#888" }}>
              or drag & drop here
            </p>
          </label>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          >
            {Array.from(new Array(numPages), (el, index) => (
              <div
                key={index}
                style={{
                  margin: "20px auto",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                  borderRadius: "6px",
                  background: "white",
                  overflow: "hidden",
                  position: "relative",
                  display: "inline-block",
                }}
              >
                {/* Page container (relative for overlays) */}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <Page
                    pageNumber={index + 1}
                    width={600}
                    onRenderSuccess={(page) =>
                      handlePageRender(index + 1, page)
                    }
                  />
                  {/* Overlays absolutely inside page */}
                  {blocksByPage[index + 1]?.map((block, i) => (
                    <div
                      key={i}
                      style={getOverlayStyle(
                        block.Geometry.BoundingBox,
                        index + 1,
                        block.Id
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </Document>
        )}
      </div>

      {/* Right: Extracted Data */}
      <div
        style={{
          flex: 1,
          minWidth: "50%",
          padding: "20px",
          overflowY: "auto",
          background: "#1e1e1e",
          color: "white",
        }}
      >
        <h2 style={{ marginBottom: "15px", fontSize: "20px" }}>
          📑 Extracted Data
        </h2>
        {jsonResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {jsonResult.Blocks.filter((b) => b.BlockType === "LINE").map(
              (line, i) => (
                <div
                  key={i}
                  onClick={() => setHighlighted(line.Id)}
                  style={{
                    padding: "10px 12px",
                    background: highlighted === line.Id ? "#ffd54f" : "#2c2c2c",
                    borderRadius: "8px",
                    cursor: "pointer",
                    color: highlighted === line.Id ? "black" : "white",
                    fontSize: "14px",
                    transition: "all 0.25s ease-in-out",
                    boxShadow:
                      highlighted === line.Id
                        ? "0 0 10px rgba(255, 235, 59, 0.8)"
                        : "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                >
                  {line.Text}
                </div>
              )
            )}
          </div>
        ) : (
          <p style={{ color: "#aaa" }}>Waiting for extraction...</p>
        )}
      </div>
    </div>
  );
}
