import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";
import { GEMINI_SYSTEM_INSTRUCTIONS, GOLD_SEARCH_QUERY } from "../lib/constants/gemini-prompts";
import crypto from "crypto";

const prisma = new PrismaClient();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
function getVietnamHour() {
    const now = new Date();
    // Chuyển đổi sang string theo múi giờ VN rồi lấy số giờ
    const vnTime = now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
    const hour = parseInt(vnTime.split(", ")[1].split(":")[0]);
    return hour;
}

function getPublishingSlot() {
    const now = new Date();
    const hour = now.getHours();

    // Khung 1: Sáng (7h-10h) - Cho phép cập nhật lúc 9h-10h
    if (hour >= 7 && hour < 10) {
        return { id: 1, name: "SÁNG", start: 7, end: 10, canUpdate: hour >= 9 };
    }
    // Khung 2: Trưa (11h-15h) - Cho phép cập nhật lúc 14h-15h (2-3h chiều)
    if (hour >= 11 && hour < 15) {
        return { id: 2, name: "TRƯA", start: 11, end: 15, canUpdate: hour >= 14 };
    }
    // Khung 3: Chiều (15h-18h) - Cho phép cập nhật lúc 17h-18h (5-6h chiều)
    if (hour >= 15 && hour < 18) {
        return { id: 3, name: "CHIỀU", start: 15, end: 18, canUpdate: hour >= 17 };
    }
    return null;
}
async function generateDailySlug() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    const count = await prisma.news.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } }
    });

    return `tin-vang-${dateStr}-${count + 1}`;
}

async function run() {
    const slot = getPublishingSlot();
    if (!slot) {
        console.log("😴 Ngoài khung giờ hoạt động. Script dừng.");
        return;
    }

    try {
        const now = new Date();
        const startOfSlot = new Date(new Date().setHours(slot.start, 0, 0, 0));
        const endOfSlot = new Date(new Date().setHours(slot.end, 0, 0, 0));

        // Tìm tin đã tồn tại trong khung giờ này
        const existingNews = await prisma.news.findFirst({
            where: {
                createdAt: { gte: startOfSlot, lte: endOfSlot },
                author: "giavang24"
            }
        });

        // LOGIC KIỂM TRA ĐIỀU KIỆN CHẠY GEMINI
        if (existingNews) {
            if (!slot.canUpdate) {
                console.log(`✅ Khung ${slot.name} đã có tin. Chưa đến giờ cập nhật (Cần chờ đến khung giờ: ${slot.id === 1 ? '9h' : slot.id === 2 ? '14h' : '17h'}).`);
                return;
            }

            // Nếu đã cập nhật rồi trong khung giờ update (cách nhau < 60p) thì cũng bỏ qua để tiết kiệm
            const lastUpdated = new Date(existingNews.updatedAt).getTime();
            if (now.getTime() - lastUpdated < 60 * 60 * 1000) {
                console.log(`⏳ Bản tin ${slot.name} vừa được cập nhật xong. Không cần quét lại ngay.`);
                return;
            }
            console.log(`🔄 Đang trong khung giờ vàng để cập nhật lại bản tin ${slot.name}...`);
        } else {
            console.log(`🆕 Chưa có tin cho khung ${slot.name}. Đang tạo mới...`);
        }
    console.log("🚀 Đang tổng hợp bản tin duy nhất (bao gồm shortVi)...");
    try {
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

        if (!item || !item.headline) return;

        const hash = crypto.createHash("md5").update(item.headline).digest("hex");
        const existing = await prisma.news.findUnique({ where: { hash } });

        if (!existing) {
            const slug = await generateDailySlug();

            await prisma.news.create({
                data: {
                    headlineVi: item.headline,
                    headlineEn: item.headline,
                    shortVi: item.short,           // ✅ Đã thêm shortVi
                    shortEn: item.short,           // ✅ Đã thêm shortVi
                    contentVi: item.content,       // HTML chi tiết
                    contentEn: item.content,       // HTML chi tiết
                    metaDesc: item.metaDesc,
                    slugVi: slug,
                    slugEn: slug,
                    tags: item.tags,
                    keywords: item.tags,
                    hash: hash,
                    author: "giavang24",
                    pageCited: "Giavang24",
                    category: "DOMESTIC",
                    active: true,
                    detailLink: `https://giavang24.vn/tin-tuc/${slug}`
                }
            });
            console.log(`✅ Xuất bản: ${slug}`);
        } else {
            console.log(`🔄 Cập nhật bài cũ: ${existing.slugVi}`);
            await prisma.news.update({
                where: { hash },
                data: {
                    shortVi: item.short,
                    shortEn: item.short,
                    contentVi: item.content,       // HTML chi tiết
                    contentEn: item.content,       // HTML chi tiết
                }
            });
        }
    } catch (e) {
        console.error("❌ Lỗi:", e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
