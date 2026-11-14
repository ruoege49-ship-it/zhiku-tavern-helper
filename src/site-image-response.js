/** 看字节认图片格式 */
function imgMime(u8) {
    if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
    if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57 && u8[9] === 0x45) return 'image/webp';
    return '';
}
/** 在一段二进制里找出所有完整的 PNG（有的站点回 msgpack 流：中间预览 + 最终图） */
function findPngs(u8) {
    const out=[],sig=[137,80,78,71,13,10,26,10],dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    for(let i=0;i+8<=u8.length;i++){
        if(!sig.every((v,n)=>u8[i+n]===v))continue;
        let pos=i+8;
        if(pos+25>u8.length||dv.getUint32(pos)!==13||u8[pos+4]!==73||u8[pos+5]!==72||u8[pos+6]!==68||u8[pos+7]!==82)continue;
        while(pos+12<=u8.length){
            const len=dv.getUint32(pos),next=pos+12+len;
            if(next>u8.length)break;
            if(!Array.from(u8.subarray(pos+4,pos+8)).every(c=>(c>=65&&c<=90)||(c>=97&&c<=122)))break;
            if(pos!==i+8&&u8[pos+4]===73&&u8[pos+5]===72&&u8[pos+6]===68&&u8[pos+7]===82)break;
            if(len===0&&u8[pos+4]===73&&u8[pos+5]===69&&u8[pos+6]===78&&u8[pos+7]===68){out.push(u8.subarray(i,next));i=next-1;break;}
            pos=next;
        }
    }
    return out;
}
/**
 * 解析站点返回的图。返回里有好几张（中间预览 + 最终图）时取最后一张。
 * 把返回格式记在当前请求里，写进问题记录
 */
async function imageFromResponse(u8, info = {}) {
    info.size = u8.length;
    const pick = (list, what) => { info.format = list.length > 1 ? `${what}，里面 ${list.length} 张图，用了最后一张` : what; return list[list.length - 1]; };
    const asUrl = file => `data:${imgMime(file) || 'image/png'};base64,` + toB64(file);
    const mime = imgMime(u8);
    if (mime) {
        const more = mime === 'image/png' ? findPngs(u8) : [];
        if (more.length) return asUrl(pick(more, 'PNG 图片'));
        info.format = mime.replace('image/', '').toUpperCase() + ' 图片';
        return asUrl(u8);
    }
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    if (isZip) {
        const entries = await unzipImages(u8);
        info.entries = entries.map(e => e.name);
        if (!entries.length) { info.format = 'zip 压缩包（里面没有图）'; throw new Error('压缩包里没有图片'); }
        const e = pick(entries, 'zip 压缩包');
        return asUrl(await e.read());
    }
    const t = new TextDecoder().decode(u8).trim();
    if (t.startsWith('{')) {
        let j = null;
        try { j = JSON.parse(t); } catch { info.format = 'JSON（解析不了）'; throw new Error('站点返回的 JSON 坏了：' + t.slice(0, 120)); }
        const imgs = Array.isArray(j.images) ? j.images.filter(Boolean) : j.image ? [j.image] : [];
        if (imgs.length) return toDataUrl(pick(imgs, 'JSON'));
        info.format = 'JSON（没有图）';
        throw new Error(j.message || j.error?.message || (typeof j.error === 'string' ? j.error : JSON.stringify(j.error)) || t.slice(0, 150));
    }
    if (t.startsWith('data:image/')) { info.format = 'data URL 文本'; return t; }
    if (t.startsWith('iVBOR')) { info.format = 'base64 PNG 文本'; return toDataUrl(t); }
    if (t.startsWith('UEsDB')) {
        const bin = Uint8Array.from(atob(t.replace(/\s+/g, '')), c => c.charCodeAt(0));
        const r = await imageFromResponse(bin, info);
        info.format = 'base64 文本里的' + (info.format || 'zip');
        return r;
    }
    if (/^<|<html/i.test(t)) { info.format = '网页'; throw new Error('站点返回的是网页，不是图片。检查一下地址对不对'); }
    const pngs = findPngs(u8);
    if (pngs.length) return asUrl(pick(pngs, '不认识的格式（像 msgpack 流）'));
    info.format = '不认识的格式，开头字节 ' + Array.from(u8.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error('返回的不是图片：' + t.slice(0, 120));
}
/** 压缩包里所有图片：[{ name, read() }]，按包里的顺序 */
async function unzipImages(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('图片压缩包坏了');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
        const local = dv.getUint32(p + 42, true);
        const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
        out.push({ name, read: async () => {
            const lName = dv.getUint16(local + 26, true), lExtra = dv.getUint16(local + 28, true);
            const start = local + 30 + lName + lExtra, data = u8.subarray(start, start + csize);
            if (method === 0) return data;
            if (method === 8) return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
            throw new Error('不认识的压缩方式 ' + method);
        } });
    }
    return out;
}
