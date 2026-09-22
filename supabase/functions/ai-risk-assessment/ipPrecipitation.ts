export type IpPrecipitationInput = {
  lang: 'no' | 'en';
  skipped: boolean;
  precipitation: number | null | undefined;
  precipitationMin?: number | null;
  precipitationMax?: number | null;
  periodHours?: number | null;
  ipRating?: string | null;
  sourceStatus?: string | null;
  manufacturerLimitation?: string | null;
};

export type IpPrecipitationObservation = {
  actualCondition: string;
  concern: string | null;
};

const formatNumber = (value: number, lang: 'no' | 'en') =>
  value.toLocaleString(lang === 'en' ? 'en-GB' : 'nb-NO', { maximumFractionDigits: 1 });

export function deriveIpPrecipitationObservation(input: IpPrecipitationInput): IpPrecipitationObservation | null {
  if (input.skipped) return null;

  const documented = input.sourceStatus === 'documented' && Boolean(input.ipRating);
  const precipitation = Number.isFinite(Number(input.precipitation)) ? Math.max(0, Number(input.precipitation)) : 0;
  const min = Number.isFinite(Number(input.precipitationMin)) ? Math.max(0, Number(input.precipitationMin)) : precipitation;
  const max = Number.isFinite(Number(input.precipitationMax)) ? Math.max(0, Number(input.precipitationMax)) : precipitation;
  const hours = Number.isFinite(Number(input.periodHours)) ? Math.max(1, Number(input.periodHours)) : 1;
  const amount = min !== max
    ? `${formatNumber(min, input.lang)}–${formatNumber(max, input.lang)} mm/t`
    : `${formatNumber(max, input.lang)} mm/t`;

  if (precipitation <= 0 && max <= 0) {
    return {
      actualCondition: input.lang === 'en'
        ? `No precipitation is forecast. Aircraft IP rating: ${documented ? input.ipRating : 'Not documented'}.`
        : `Det er ikke varslet nedbør. Dronens IP-rating: ${documented ? input.ipRating : 'Ikke dokumentert'}.`,
      concern: null,
    };
  }

  if (!documented) {
    return {
      actualCondition: input.lang === 'en'
        ? `Forecast precipitation: ${amount} over a ${hours}-hour assessment period. Aircraft IP rating: Not documented.`
        : `Varslet nedbør: ${amount} i en vurderingsperiode på ${hours} time(r). Dronens IP-rating: Ikke dokumentert.`,
      concern: input.lang === 'en'
        ? 'Rain resistance is not documented. The pilot must verify the manufacturer manual and operational limitations before flight. This information does not create a hard stop.'
        : 'Regnbestandighet er ikke dokumentert. Piloten må kontrollere produsentmanual og operative begrensninger før flyging. Informasjonen utløser ikke hard stop.',
    };
  }

  const limitation = input.manufacturerLimitation?.trim();
  return {
    actualCondition: input.lang === 'en'
      ? `Forecast precipitation: ${amount} over a ${hours}-hour assessment period. Aircraft IP rating: ${input.ipRating}.`
      : `Varslet nedbør: ${amount} i en vurderingsperiode på ${hours} time(r). Dronens IP-rating: ${input.ipRating}.`,
    concern: input.lang === 'en'
      ? `Precipitation warning. ${limitation || 'Follow the manufacturer operational limitations; the IP rating is not an unconditional guarantee.'} This warning does not create a hard stop by itself.`
      : `Nedbørsadvarsel. ${limitation || 'Følg produsentens operative begrensninger; IP-ratingen er ikke en ubetinget garanti.'} Advarselen utløser ikke hard stop alene.`,
  };
}