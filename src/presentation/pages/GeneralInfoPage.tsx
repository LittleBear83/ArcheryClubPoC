const quickFacts = [
  "Founded in 1976.",
  "Based in Selby at the same site as Selby RUFC.",
  "More than 100 members across a wide range of experience levels.",
  "Open to archers using traditional longbow, recurve, compound, and other bow styles.",
];

const facilities = [
  "A purpose-built 20 yard indoor archery range.",
  "An 11 lane 100 yard outdoor range.",
  "Kitchen facilities for members using the indoor space.",
  "Onsite parking and a purpose-built toilet block.",
];

const beginners = [
  "Beginners can start through fully coached beginners courses.",
  "The club supports archers from complete beginner level upward.",
  "Coaching and club activity are designed to help members progress into regular shooting.",
];

const clubLife = [
  "Regular shooting opportunities for members across different disciplines.",
  "Club events and competitions, including club championships.",
  "Tournament activity including the Selby Open.",
  "A mixed membership covering casual, developing, and high-performance archers.",
];

export function GeneralInfoPage() {
  return (
    <div className="profile-page general-info-page">
      <section className="profile-form">
        <h2 className="profile-section-title">Club Information Centre</h2>
        <p>
          This page brings together the main background information about Selby
          Archers in one place. It is intended as a quick in-app reference for
          members, beginners, and visitors who want an overview of the club,
          its facilities, and the kind of activity it supports.
        </p>
        <p>
          Selby Archers is a long-established club with a broad membership base
          and facilities that support both everyday practice and organised club
          activity. The club welcomes archers at different stages of experience,
          from people just starting out to more experienced competitive
          archers.
        </p>
      </section>

      <section className="general-info-grid">
        <section className="home-panel">
          <h3 className="home-panel-title">At A Glance</h3>
          <ul className="home-info-list">
            {quickFacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Facilities</h3>
          <ul className="home-info-list">
            {facilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Beginners And Membership</h3>
          <ul className="home-info-list">
            {beginners.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="home-panel">
          <h3 className="home-panel-title">Club Life</h3>
          <ul className="home-info-list">
            {clubLife.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </section>
    </div>
  );
}
