import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";
import { GEMINI_SYSTEM_INSTRUCTIONS, GOLD_SEARCH_QUERY } from "../lib/constants/gemini-prompts";
import crypto from "crypto";

const prisma = new PrismaClient();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function getPublishingSlot() {
    const now = new Date();
    const hour = now.getHours();

    // Khung 1: Sáng (7h-10h) - Update lúc 9h
    if (hour >= 6 && hour < 10) return { id: 1, name: "SÁNG", start: 6, end: 10, canUpdate: hour >= 9 };
    // Khung 2: Trưa (11h-15h) - Update lúc 14h
    if (hour >= 11 && hour < 15) return { id: 2, name: "TRƯA", start: 11, end: 15, canUpdate: hour >= 14 };
    // Khung 3: Chiều (15h-18h) - Update lúc 17h
    if (hour >= 15 && hour < 18) return { id: 3, name: "CHIỀU", start: 15, end: 18, canUpdate: hour >= 17 };

    return null;
}

async function generateDailySlug(id: number) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    // Sử dụng ID khung giờ để slug đẹp và cố định: tin-vang-20260302-1
    return `tin-vang-${dateStr}-${id}`;
}

async function run() {
    const slot = getPublishingSlot();
    if (!slot) {
        console.log("😴 Ngoài khung giờ hoạt động. Script tạm nghỉ.");
        return;
    }

    try {
        const now = new Date();
        const startOfSlot = new Date(new Date().setHours(slot.start, 0, 0, 0));
        const endOfSlot = new Date(new Date().setHours(slot.end, 0, 0, 0));

        const existingNews = await prisma.news.findFirst({
            where: {
                createdAt: { gte: startOfSlot, lte: endOfSlot },
                author: "giavang24"
            }
        });

        // Kiểm tra điều kiện Update
        if (existingNews) {
            if (!slot.canUpdate) {
                console.log(`✅ Khung ${slot.name} đã có tin. Chờ đến giờ cập nhật.`);
                return;
            }
            const lastUpdateDate = existingNews.updatedAt ? new Date(existingNews.updatedAt) : new Date(existingNews.createdAt);
            const timeSinceLastUpdate = now.getTime() - lastUpdateDate.getTime();
            if (timeSinceLastUpdate < 60 * 60 * 1000) {
                console.log(`⏳ Bản tin ${slot.name} vừa cập nhật cách đây < 1 tiếng. Bỏ qua.`);
                return;
            }
        }

        console.log(`🚀 Đang gọi Gemini cho khung giờ ${slot.name}...`);

        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: GOLD_SEARCH_QUERY }] }],
            config: {
                systemInstruction: GEMINI_SYSTEM_INSTRUCTIONS,
                tools: [{ googleSearch: {} }],
                temperature: 0.3
            }
        });

        const responseText = result.text;
        if (!responseText) throw new Error("Empty response from Gemini");

        const cleanJson = responseText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        const item = Array.isArray(parsed.news) ? parsed.news[0] : parsed.news;

        // Lưu ý: Kiểm tra kỹ tên trường Gemini trả về (thường là headlineVi, summaryVi...)
        const headline = item.headlineVi || item.headline;
        const summary = item.summaryVi || item.content;
        const short = item.shortVi || item.short;

        if (!headline) return;

        const hash = crypto.createHash("md5").update(headline).digest("hex");

        if (existingNews) {
            // CẬP NHẬT
            if (existingNews.hash !== hash) {
                await prisma.news.update({
                    where: { id: existingNews.id },
                    data: {
                        headlineVi: headline,
                        shortVi: short,
                        contentVi: summary,
                        hash: hash,
                        updatedAt: new Date()
                    }
                });
                console.log(`🔄 Đã cập nhật bản tin ${slot.name}`);
            } else {
                console.log("✅ Nội dung không có thay đổi mới.");
            }
        } else {
            // TẠO MỚI
            const slug = await generateDailySlug(slot.id);
            await prisma.news.create({
                data: {
                    headlineVi: headline,
                    headlineEn: headline,
                    shortVi: short,
                    shortEn: short,
                    contentVi: summary,
                    contentEn: summary,
                    metaDesc: item.metaDescription || item.metaDesc,
                    slugVi: slug,
                    slugEn: slug.replace("tin-vang", "gold-news"),
                    tags: item.tags || [],
                    keywords: item.tags || [],
                    hash: hash,
                    author: "giavang24",
                    pageCited: "Giavang24",
                    category: "DOMESTIC",
                    active: true,
                    detailLink: `https://giavang24.com.vn/tin-tuc/${slug}`
                }
            });
            console.log(`✨ Đã xuất bản tin mới: ${slug}`);
        }

    } catch (e) {
        console.error("❌ Lỗi thực thi:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
