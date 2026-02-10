import prisma from "@/lib/prisma";
import Link from "next/link";

export default async function HomePage() {
    const allNews = await prisma.news.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
    });

    return (
        <main className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-8 border-b-2 border-gold pb-2">Tin Tức Giá Vàng Mới Nhất</h1>
            <div className="grid gap-6">
                {allNews.length === 0 && <p>Chưa có tin tức nào được xuất bản.</p>}
                {allNews.map((news) => (
                    <article key={news.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold text-blue-900 mb-2">
                            <Link href={news.detailLink} target="_blank">{news.headlineVi}</Link>
                        </h2>
                        <p className="text-gray-600 mb-4">{news.shortVi}</p>
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>Nguồn: {news.pageCited}</span>
                            <span>{news.createdAt.toLocaleDateString('vi-VN')}</span>
                        </div>
                    </article>
                ))}
            </div>
        </main>
    );
}
