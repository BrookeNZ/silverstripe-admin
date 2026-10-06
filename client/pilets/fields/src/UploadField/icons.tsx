/**
 * Two icons the upload field's design uses that the patterns package does not have yet. They draw
 * into the package's Icon frame like the rest of the set; move them into its icons file once that file
 * is free to edit. Each glyph keeps its inset in the design's 18px slot
 */
import * as React from 'react';
import { Icon } from '@silverstripe/admin-patterns';
import type { IconProps } from '@silverstripe/admin-patterns';

/** Figma "Global icons" Type=Image stack, node 2:276, in the image field's empty state 2:6067 */
export const UploadIcon = (props: IconProps) => (
  <Icon viewBox="0 0 18 18" {...props}>
    <path
      transform="translate(1 1)"
      d="M15.406 6.443c.157 0 .313.063.438.19q.155.19.156.474v7.614c0 .19-.062.316-.156.474a.6.6 0 0 1-.438.189H3.812a.6.6 0 0 1-.438-.19c-.125-.157-.156-.284-.156-.473V7.106c0-.19.031-.347.156-.473a.6.6 0 0 1 .438-.19zm-4.718 3.065-2.063 2.148-2.219-2.749-1.47 3.444v1.39H14.5v-2.59l-1.156-2.591zm.593-9.478c.375-.095.626.031.782.41l1.625 4.55h-1.594l-1.969-2.433-3.437 2.433H3.812c-.562 0-1.031.221-1.438.632a2.08 2.08 0 0 0-.594 1.484v2.56L.03 4.895c-.093-.41.032-.695.344-.853z"
    />
  </Icon>
);

/** Figma "Global icons" Type=Eye, node 2:228, in the image field's uploaded state 2:6074 */
export const PreviewIcon = (props: IconProps) => (
  <Icon viewBox="0 0 18 18" {...props}>
    <path
      transform="translate(1 4)"
      d="M8 0q1.453.001 2.844.382 1.358.43 2.25 1.017.89.62 1.594 1.273.656.62 1 1.145.312.525.312.732c0 .159-.094.381-.313.731q-.327.477-1 1.146-.701.668-1.593 1.272-.892.573-2.25 1.018Q9.453 9.096 8 9.098t-2.844-.382Q3.798 8.286 2.906 7.698 2.016 7.078 1.312 6.426q-.655-.669-1-1.146C.094 4.93 0 4.708 0 4.549c0-.16.094-.382.313-.732q.326-.524 1-1.145.701-.668 1.593-1.273Q3.798.83 5.156.382A10.6 10.6 0 0 1 8 0m0 1.018q-1.453-.001-2.5 1.05-1.078 1.001-1.062 2.481c0 .954.343 1.781 1.062 2.449q1.031 1.05 2.5 1.05 1.453 0 2.5-1.05c.719-.668 1.063-1.495 1.063-2.45q0-1.478-1.063-2.48Q9.47 1.018 8 1.018M8 2.8c.156 0 .188.127.156.35q-.046.381-.187.795c-.094.254-.063.445.031.604.094.096.281.096.594.032l.812-.191q.328-.048.375.16 0 .716-.531 1.208A1.68 1.68 0 0 1 8 6.267a1.68 1.68 0 0 1-1.25-.509A1.6 1.6 0 0 1 6.25 4.55q0-.764.5-1.24A1.68 1.68 0 0 1 8 2.8"
    />
  </Icon>
);
