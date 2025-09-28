import dotenv from "dotenv";
dotenv.config();
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
    TextractClient,
    StartDocumentAnalysisCommand,
    GetDocumentAnalysisCommand,
} from "@aws-sdk/client-textract";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import cors from "cors";
const app = express();

app.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

const upload = multer({ dest: "uploads/" });

const REGION = process.env.AWS_REGION;
const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET = `${process.env.S3_BUCKET}`;

const textractClient = new TextractClient({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const filePath = req.file.path;
    const fileBytes = fs.readFileSync(filePath);
    const s3Key = `uploads/${Date.now()}_${path.basename(req.file.originalname)}`;

    try {
        // Upload file to S3
        await s3Client.send(
            new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: s3Key,
                Body: fileBytes,
                ContentType: req.file.mimetype,
            })
        );

        // Clean local temp file
        fs.unlinkSync(filePath);

        // Start Textract analysis
        const startCmd = new StartDocumentAnalysisCommand({
            DocumentLocation: { S3Object: { Bucket: S3_BUCKET, Name: s3Key } },
            FeatureTypes: ["TABLES", "FORMS"],
        });

        const job = await textractClient.send(startCmd);

        res.json({
            message: "Textract job started",
            JobId: job.JobId,
            fileUrl: `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`,
        });

    } catch (err) {
        console.error("Textract error:", err);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: err.message });
    }
});

app.get("/results/:jobId", async (req, res) => {
    const jobId = req.params.jobId;

    try {
        const results = [];
        let nextToken;

        // Paginate through Textract results
        do {
            const getCmd = new GetDocumentAnalysisCommand({
                JobId: jobId,
                NextToken: nextToken,
            });
            const data = await textractClient.send(getCmd);

            if (data.Blocks) results.push(...data.Blocks);
            nextToken = data.NextToken;

            if (data.JobStatus === "IN_PROGRESS") {
                return res.json({ status: "IN_PROGRESS" });
            }
            if (data.JobStatus === "FAILED") {
                return res.status(500).json({ status: "FAILED" });
            }
        } while (nextToken);

        res.json({ status: "SUCCEEDED", Blocks: results });
    } catch (err) {
        console.error("Get results error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(5000, () => {
    console.log("Backend running at http://localhost:5000");
});