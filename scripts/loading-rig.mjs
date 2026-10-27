export const frameSize = 160;
export const frameCount = 32;
export const cycleDuration = 840;
export const legBuild = Object.freeze({
    nearThigh: 25, farThigh: 23, nearShin: 22, farShin: 20,
    footWidth: 28, footHeight: 22, footFront: 19, footBottom: 10,
});

function hermite(start, end, startVelocity, endVelocity, t) {
    const squared = t * t, cubed = squared * t;
    return (2 * cubed - 3 * squared + 1) * start + (cubed - 2 * squared + t) * startVelocity
        + (-2 * cubed + 3 * squared) * end + (cubed - squared) * endVelocity;
}

export function legPose(hip, phase, ground = 145) {
    const turn = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const progress = turn / (Math.PI * 2), stance = .38;
    const swing = (progress - stance) / (1 - stance);
    const toeRoll = .36;
    const rollProgress = Math.max(0, Math.min(1, (progress / stance - .68) / .32));
    const smoothRoll = rollProgress * rollProgress * (3 - 2 * rollProgress);
    const footAngle = progress <= stance ? toeRoll * smoothRoll : toeRoll * (1 - swing) - .55 * Math.sin(swing * Math.PI);
    const rollRise = 19 * Math.sin(toeRoll) + 10 * Math.cos(toeRoll) - 10;
    const recoveryVelocity = -40 / stance * (1 - stance);
    const ankle = progress <= stance
        ? { x: hip.x + 20 - 40 * progress / stance, y: ground + 10 - (19 * Math.sin(footAngle) + 10 * Math.cos(footAngle)) }
        : { x: hip.x + hermite(-20, 20, recoveryVelocity, recoveryVelocity, swing), y: ground - rollRise * (1 - swing) - 24 * Math.sin(swing * Math.PI) };
    const upper = 20, lower = 24;
    const dx = ankle.x - hip.x, dy = ankle.y - hip.y;
    const distance = Math.min(Math.hypot(dx, dy), upper + lower - .01);
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
    const length = Math.hypot(dx, dy);
    // Both knees bend forward in the same anatomical direction, never swapping identities.
    const knee = { x: hip.x + along * dx / length + offset * dy / length, y: hip.y + along * dy / length - offset * dx / length };
    return { hip, knee, ankle, footAngle, planted: progress <= stance };
}

export function drawRunner(context, parts, phase) {
    context.clearRect(0, 0, 160, 160);
    context.imageSmoothingEnabled = false;
    const height = 106, width = height * parts.body.width / parts.body.height;
    const x = 90 - width / 2 + .5 * Math.sin(phase * 2), y = 8 + 2.2 * Math.sin(phase * 2 + .3);
    const lean = .21 + .012 * Math.sin(phase * 2 - .8);
    const pelvis = { x: x + width * .5, y: y + height * .97 };
    const onTorso = (u, v) => {
        const dx = x + width * u - pelvis.x, dy = y + height * v - pelvis.y;
        return { x: pelvis.x + dx * Math.cos(lean) - dy * Math.sin(lean), y: pelvis.y + dx * Math.sin(lean) + dy * Math.cos(lean) };
    };
    const nearHip = onTorso(.46, .97), farHip = onTorso(.63, .97);
    const nearLeg = legPose(nearHip, phase);
    const farLeg = legPose(farHip, phase + Math.PI);
    const bone = (image, start, end, thickness) => {
        context.save();context.translate(start.x, start.y);
        context.rotate(Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2);
        context.drawImage(image, -thickness / 2, -2, thickness, Math.hypot(end.x - start.x, end.y - start.y) + 4);
        context.restore();
    };
    const foot = (image, pose) => {
        context.save();context.translate(pose.ankle.x, pose.ankle.y);
        context.rotate(pose.footAngle);
        // Widen the boot backwards/upwards so the existing contact toe stays fixed.
        context.drawImage(image, legBuild.footFront - legBuild.footWidth, legBuild.footBottom - legBuild.footHeight, legBuild.footWidth, legBuild.footHeight);context.restore();
    };
    const arm = (image, anchor, limbPhase) => {
        context.save();context.translate(anchor.x, anchor.y);
        context.rotate(lean + .60 * Math.cos(limbPhase - .1));
        const width = 33, height = 29, left = -7, top = -1;
        const drawClipped = points => {
            context.save();context.beginPath();
            points.forEach(([u, v], index) => context[index ? 'lineTo' : 'moveTo'](left + u * width, top + v * height));
            context.closePath();context.clip();
            context.drawImage(image, left, top, width, height);context.restore();
        };
        // One immutable arm image supplies both segments, with an overlapping elbow seam.
        drawClipped([[0,0],[1,0],[1,.44],[.44,.44],[.27,.74],[.35,1],[0,1]]);
        const elbowX = left + width * .29, elbowY = top + height * .68;
        context.translate(elbowX, elbowY);
        context.rotate(-.13 + .13 * Math.cos(limbPhase - .25));
        context.translate(-elbowX, -elbowY);
        drawClipped([[.39,.41],[1,.41],[1,1],[.29,1],[.22,.74]]);
        context.restore();
    };
    const tailRoot = onTorso(.24, .91);
    context.save();context.translate(tailRoot.x, tailRoot.y);
    context.rotate(.07 * Math.sin(phase));context.drawImage(parts.tail, -61, -18, 66, 39);context.restore();
    // Layer ownership is permanent: far limbs behind the body; near limbs in front.
    arm(parts.farArm, onTorso(.78, .65), phase + Math.PI);
    bone(parts.farThigh, farLeg.hip, farLeg.knee, legBuild.farThigh);
    bone(parts.farShin, farLeg.knee, farLeg.ankle, legBuild.farShin);
    foot(parts.farFoot, farLeg);
    bone(parts.nearThigh, nearLeg.hip, nearLeg.knee, legBuild.nearThigh);
    bone(parts.nearShin, nearLeg.knee, nearLeg.ankle, legBuild.nearShin);
    foot(parts.nearFoot, nearLeg);
    context.save();context.translate(pelvis.x, pelvis.y);context.rotate(lean);
    context.drawImage(parts.body, x - pelvis.x, y - pelvis.y, width, height);context.restore();
    arm(parts.nearArm, onTorso(.30, .66), phase);
}
