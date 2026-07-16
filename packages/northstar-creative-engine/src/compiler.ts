import { z } from 'zod';
import {
  CommercialRenderPlanSchema,
  CreativePlanSchema,
  ENGINE_VERSION,
  RENDER_PLAN_VERSION,
  SupportedLocaleSchema,
  type CommercialRenderPlan,
  type CreativePlan,
  type PlatformIntent,
  type PlatformPreset,
  type RenderScene,
  type SceneCopy,
  type SceneDirective,
  type SupportedLocale,
} from './contracts.js';
import { fnv1aHex } from './hash.js';

export const CommercialContentSchema = z.object({
  businessName: z.string().trim().min(1),
  productOrService: z.string().trim().min(1),
  offer: z.string().trim().optional(),
  price: z.string().trim().optional(),
  callToAction: z.string().trim().optional(),
  supportingDetails: z.array(z.string().trim().min(1)).default([]),
  locale: SupportedLocaleSchema.default('en'),
});
export type CommercialContent = z.input<typeof CommercialContentSchema>;
type ParsedCommercialContent = z.output<typeof CommercialContentSchema>;

export interface SceneCopyContext {
  plan: CreativePlan;
  scene: SceneDirective;
  sceneIndex: number;
  content: ParsedCommercialContent;
}

export type SceneCopyProvider = (context: SceneCopyContext) => SceneCopy;

const DEFAULT_CTA: Record<SupportedLocale, string> = {
  en: 'Visit us today',
  es: 'Visítanos hoy',
  pt: 'Visite-nos hoje',
};

function sentence(locale: SupportedLocale, en: string, es: string, pt: string): string {
  return { en, es, pt }[locale];
}

function builtInSceneCopy(context: SceneCopyContext): SceneCopy {
  const { scene, content } = context;
  const locale = content.locale;
  const product = content.productOrService;
  const offer = content.offer ?? '';
  const price = content.price ?? '';
  const detail = content.supportingDetails[context.sceneIndex % Math.max(1, content.supportingDetails.length)] ?? '';
  const cta = content.callToAction || DEFAULT_CTA[locale];

  switch (scene.role) {
    case 'hook': {
      const headline = sentence(locale, `Need ${product}?`, `¿Necesitas ${product}?`, `Precisa de ${product}?`);
      return { kicker: content.businessName, headline, body: offer, caption: headline, spokenText: headline };
    }
    case 'intro': {
      const headline = content.businessName;
      const body = sentence(locale, `A better way to get ${product}`, `Una mejor manera de obtener ${product}`, `Uma forma melhor de obter ${product}`);
      return { kicker: content.businessName, headline, body, caption: body, spokenText: body };
    }
    case 'problem': {
      const headline = sentence(locale, `The problem with ${product}`, `El problema con ${product}`, `O problema com ${product}`);
      const body = detail || sentence(locale, 'Do not let it slow you down.', 'No dejes que te detenga.', 'Não deixe isso atrasar você.');
      return { kicker: '', headline, body, caption: body, spokenText: `${headline}. ${body}` };
    }
    case 'solution': {
      const headline = sentence(locale, `A clear solution for ${product}`, `Una solución clara para ${product}`, `Uma solução clara para ${product}`);
      const body = detail || sentence(locale, 'Simple, professional and ready when you are.', 'Simple, profesional y listo cuando tú quieras.', 'Simples, profissional e pronto quando você estiver.');
      return { kicker: content.businessName, headline, body, caption: headline, spokenText: `${headline}. ${body}` };
    }
    case 'feature': {
      const headline = detail || product;
      const body = sentence(locale, 'Designed around what matters most.', 'Diseñado alrededor de lo que más importa.', 'Pensado no que mais importa.');
      return { kicker: '', headline, body, caption: headline, spokenText: `${headline}. ${body}` };
    }
    case 'proof': {
      const headline = sentence(locale, 'See the difference', 'Mira la diferencia', 'Veja a diferença');
      const body = detail || sentence(locale, 'Real process. Clear result.', 'Proceso real. Resultado claro.', 'Processo real. Resultado claro.');
      return { kicker: content.businessName, headline, body, caption: body, spokenText: `${headline}. ${body}` };
    }
    case 'testimonial': {
      const headline = sentence(locale, 'Customers notice the difference', 'Los clientes notan la diferencia', 'Os clientes percebem a diferença');
      const body = detail || sentence(locale, 'Trusted by people who expect quality.', 'La confianza de quienes esperan calidad.', 'A confiança de quem espera qualidade.');
      return { kicker: '', headline, body, caption: body, spokenText: `${headline}. ${body}` };
    }
    case 'comparison': {
      const headline = sentence(locale, 'Before and after', 'Antes y después', 'Antes e depois');
      const body = sentence(locale, 'One clear transformation.', 'Una transformación clara.', 'Uma transformação clara.');
      return { kicker: '', headline, body, caption: headline, spokenText: `${headline}. ${body}` };
    }
    case 'offer': {
      const headline = offer || sentence(locale, 'Available today', 'Disponible hoy', 'Disponível hoje');
      const body = price ? sentence(locale, `Starting at ${price}`, `Desde ${price}`, `A partir de ${price}`) : detail;
      return { kicker: content.businessName, headline, body, caption: [headline, body].filter(Boolean).join(' — '), spokenText: [headline, body].filter(Boolean).join('. ') };
    }
    case 'announcement': {
      const headline = offer || sentence(locale, 'Something new is here', 'Algo nuevo ya está aquí', 'Algo novo chegou');
      return { kicker: content.businessName, headline, body: product, caption: headline, spokenText: `${headline}. ${product}.` };
    }
    case 'cta': {
      return { kicker: content.businessName, headline: cta, body: offer, caption: cta, spokenText: cta };
    }
  }
}

export function resolvePlatformPreset(intent: PlatformIntent, fps = 30): PlatformPreset {
  switch (intent) {
    case 'vertical_social':
    case 'story':
      return { intent, width: 1080, height: 1920, fps, safeMarginRatio: 0.08 };
    case 'portrait_video':
      return { intent, width: 1080, height: 1350, fps, safeMarginRatio: 0.07 };
    case 'square_social':
      return { intent, width: 1080, height: 1080, fps, safeMarginRatio: 0.07 };
    case 'landscape_video':
      return { intent, width: 1920, height: 1080, fps, safeMarginRatio: 0.06 };
    case 'generic':
      return { intent, width: 1920, height: 1080, fps, safeMarginRatio: 0.06 };
  }
}

export interface CompileCreativePlanOptions {
  plan: CreativePlan;
  content: CommercialContent;
  projectId?: string;
  fps?: number;
  copyProvider?: SceneCopyProvider;
}

/**
 * Compiles the provider-neutral creative plan into a renderer-neutral timeline.
 * No Electron, Remotion, FFmpeg or browser API is imported here.
 */
export function compileCreativePlan(options: CompileCreativePlanOptions): CommercialRenderPlan {
  const plan = CreativePlanSchema.parse(options.plan);
  const content = CommercialContentSchema.parse(options.content);
  const platform = resolvePlatformPreset(plan.platformIntent, options.fps ?? 30);
  const copyProvider = options.copyProvider ?? builtInSceneCopy;
  const projectId = options.projectId
    ?? `commercial_${fnv1aHex(`${plan.conceptId}|${content.businessName}|${content.productOrService}`)}`;

  let cursor = 0;
  const scenes: RenderScene[] = plan.scenes.map((scene, sceneIndex) => {
    const startSec = Number(cursor.toFixed(6));
    cursor += scene.durationSec;
    return {
      id: `scene_${sceneIndex}_${scene.beatPurpose}`,
      order: sceneIndex,
      role: scene.role,
      beatPurpose: scene.beatPurpose,
      startSec,
      durationSec: scene.durationSec,
      transitionIn: scene.transitionIn,
      shotBehavior: scene.shotBehavior,
      motion: scene.motion,
      textDensity: scene.textDensity,
      copy: copyProvider({ plan, scene, sceneIndex, content }),
      media: scene.assignedMedia,
      fallbackQuery: content.productOrService,
    };
  });

  return CommercialRenderPlanSchema.parse({
    version: RENDER_PLAN_VERSION,
    engineVersion: ENGINE_VERSION,
    projectId,
    conceptId: plan.conceptId,
    family: plan.family,
    variantId: plan.variantId,
    locale: content.locale,
    platform,
    durationSec: Number(cursor.toFixed(6)),
    scenes,
    creativeDirection: {
      pacingProfile: plan.pacingProfile,
      motionProfile: plan.motionProfile,
      artDirection: plan.artDirection,
      backgroundMotion: plan.backgroundMotion,
      transitionStyle: plan.transitionStyle,
      typography: plan.typography,
    },
    audioDirection: {
      music: plan.musicDirection,
      narration: plan.narrationDirection,
      duckMusicUnderNarration: true,
    },
    warnings: plan.mediaWarnings,
  });
}
