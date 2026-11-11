import assert from 'node:assert/strict';
export function applyWardrobeDisplayCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b);};
    patch("        case 'outimggen': {\n            if (!N.isReady())", "        case 'outimggen': {\n            if (ui.outfit?.busy) return true;\n            if (!N.isReady())");
    patch("            const mk = d.options.outfitModel || 'owner';", "            const mk = d.options.outfitModel || 'owner', panel = ui.outfit;\n            if (!o) return true;\n            const signature = JSON.stringify(o.tags);\n            const current = () => !stopped && getData() === d && ui.outfit === panel && curOutfit() === o && (d.options.outfitModel || 'owner') === mk && JSON.stringify(o.tags) === signature;");
    patch("                const img = await E.generateFull({ positive, negative, width: 768, height: 1344, director: owner?.charRef ? await E.charRefs([owner.charRef]) : undefined });\n                if (ui.outfit.draft) o.image = img;\n                else { o.image = (await uploadImage(img, `outfit_${M.uid('')}`)).path; saveOutfit(); }\n            } catch (e) { toastr.error(e.message, '生成失败'); }\n            ui.outfit.busy = ''; render();", `                const director = owner?.charRef ? await E.charRefs([owner.charRef]) : undefined;
                if (!current()) return true;
                const img = await E.generateFull({ positive, negative, width: 768, height: 1344, director });
                if (!current()) return true;
                if (panel.draft) o.image = img;
                else { const result = await uploadImage(img, \`outfit_\${M.uid('')}\`); if (current()) { o.image = result.path; saveOutfit(); } }
            } catch (e) { if (current()) toastr.error(e.message, '生成失败'); }
            finally { panel.busy = ''; if (!stopped) render(); }`);
    return s;
}
