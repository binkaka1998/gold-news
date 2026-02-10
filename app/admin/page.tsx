import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export default async function AdminPage() {
    const data = await prisma.news.findMany({ orderBy: { createdAt: 'desc' } });

    async function toggle(id: number, status: boolean) {
        "use server";
        await prisma.news.update({ where: { id }, data: { active: !status } });
        revalidatePath("/admin");
    }

    return (
        <div className="p-10 text-black bg-white min-h-screen">
            <h1 className="text-2xl font-bold mb-5">Admin News Manager</h1>
            <div className="space-y-4">
                {data.map((item) => (
                    <div key={item.id} className="border p-4 rounded flex justify-between items-center">
                        <div>
                            <p className="font-bold">{item.headlineVi}</p>
                            <p className="text-sm text-gray-500">{item.pageCited} - {item.createdAt.toDateString()}</p>
                        </div>
                        <form action={toggle.bind(null, item.id, item.active)}>
                            <button className={`p-2 rounded ${item.active ? 'bg-green-500' : 'bg-gray-400'} text-white`}>
                                {item.active ? "Published" : "Draft"}
                            </button>
                        </form>
                    </div>
                ))}
            </div>
        </div>
    );
}
