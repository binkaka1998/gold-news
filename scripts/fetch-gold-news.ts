import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import { GEMINI_SYSTEM_INSTRUCTIONS, GOLD_SEARCH_QUERY } from "../lib/constants/gemini-prompts";
import crypto from "crypto";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function run() {
    console.log("Checking for gold news...");
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: GEMINI_SYSTEM_INSTRUCTIONS
        }, { apiVersion: "v1beta" });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: GOLD_SEARCH_QUERY }] }],
            tools: [{ googleSearchRetrieval: {} }] as any
        });

        const responseText = result.response.text();
        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        const newsArray = parsed.news || parsed;

        for (const item of newsArray) {
            const hash = crypto.createHash('md5').update(item.detailLink).digest('hex');
            const isInternational = item.pageCited.match(/Kitco|Reuters|DailyForex/i);

            await prisma.news.upsert({
                where: { detailLink: item.detailLink },
                update: {},
                create: {
                    ...item,
                    hash,
                    active: false,
                    category: isInternational ? 'INTERNATIONAL' : 'DOMESTIC'
                }
            });
        }
        console.log("Done.");
    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}
run();
